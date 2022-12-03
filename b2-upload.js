// Import dependencies
const functions = require('firebase-functions');
const b2CloudStorage = require('b2-cloud-storage');
const BusBoy = require('busboy');
const cors = require('cors')({ origin: true });
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

// Initiate B2 with auth keys fom Environment Variables
const b2 = new b2CloudStorage({
  auth: {
    accountId: functions.config().b2.keyid,
    applicationKey: functions.config().b2.appkey,
  },
});
const B2bucketId = functions.config().b2.bucketid;

// get encryption params
const encryptionSalt = functions.config().encryption.salt;
const encryptionKey = functions.config().encryption.key;
const encryptionIv = functions.config().encryption.iv;

// Export Cloud Functions
exports.b2UploadFile = (req, res) => {
  cors(req, res, () => {
    // Initiate Busboy
    const busboy = BusBoy({ headers: req.headers });
    // Storing data of the temp file
    let tempFile = {};

    let destFolder = req.query.folder;
    let destFilename = req.query.name;

    // Process file
    busboy.on('file', (name, file, info) => {
      const { filename, encoding, mime } = info;

      // Get file extension
      const fileExtension = filename.split('.')[filename.split('.').length - 1];

      newFileName = filename; // `${destFolder}/${destFilename}.${fileExtension}`;

      // Write to temporary directory
      const filepath = path.join(os.tmpdir(), `${newFileName}`);

      tempFile = {
        filepath,
        mime,
        newFileName,
      };

      file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on('finish', async () => {
      // Encryption
      const command = `openssl enc -aes-256-ctr -in ${tempFile.filepath} -out ${tempFile.filepath}.kmlg -S ${encryptionSalt} -K ${encryptionKey} -iv ${encryptionIv}`;
      console.log('Executing', command);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`Encryption done: ${stdout}`);

        b2.authorize(function (err) {
          if (err) {
            throw err;
          }

          b2.uploadFile(
            tempFile.filepath + '.kmlg',
            {
              bucketId: B2bucketId,
              fileName: tempFile.newFileName + '.kmlg',
              // Upload to a directory
              //   fileName: "userfiles/" + thumbFileName,
              contentType: tempFile.mime,
            },
            function (err, results) {
              if (err) return res.status(500).json({ error: err });

              return res.status(201).json({ message: 'File uploaded!' });
            }
          );
        });
      });
    });

    // END
    busboy.end(req.rawBody);
  });
};

// Uploading images to Backblaze B2
exports.b2UploadImage = (req, res) => {
  cors(req, res, () => {
    // Initiate Busboy
    const busboy = BusBoy({ headers: req.headers });
    // Storing data of the temp file
    let tempFile = {};

    // Process image
    busboy.on('file', (name, file, info) => {
      const { filename, encoding, mime } = info;

      // Check if it is an image
      if (
        mime !== 'image/jpeg' &&
        mime !== 'image/png' &&
        mime !== 'image/gif'
      ) {
        return res.status(400).json({
          error: 'Wrong file type',
        });
      }

      // Get image extension
      const fileExtension = filename.split('.')[filename.split('.').length - 1];

      // Select filename / Random number with file extension
      // newFileName = `${Math.round(
      //   Math.random() * 1000000000000
      // ).toString()}.${fileExtension}`;
      newFileName = `${req.query.name}-cover.${fileExtension}`;

      // Write to temporary directory
      const filepath = path.join(os.tmpdir(), `${newFileName}`);

      tempFile = {
        filepath,
        mime,
        newFileName,
      };

      file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on('finish', () => {
      b2.authorize(function (err) {
        if (err) {
          throw err;
        }

        b2.uploadFile(
          tempFile.filepath,
          {
            bucketId: B2bucketId,
            fileName: tempFile.newFileName,
            // Upload to a directory
            //   fileName: "images/" + thumbFileName,
            contentType: tempFile.mime,
          },
          function (err, results) {
            if (err) return res.status(500).json({ error: err });

            return res.status(201).json({ message: 'Image uploaded!' });
          }
        );
      });
    });

    // END
    busboy.end(req.rawBody);
  });
};
