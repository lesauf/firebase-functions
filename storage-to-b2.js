const functions = require('firebase-functions');
const admin = require('firebase-admin');
const b2CloudStorage = require('b2-cloud-storage');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

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

// const encryptFile = (filePath) => {
//   // Encryption
//   const command = `openssl enc -aes-256-ctr -in ${filePath} -out ${filePath}.kmlg -S ${encryptionSalt} -K ${encryptionKey} -iv ${encryptionIv}`;
//   console.log('Executing', command);

//   exec(command, (error, stdout, stderr) => {
//     if (error) {
//       console.log(`error: ${error.message}`);
//       return;
//     }
//     if (stderr) {
//       console.log(`stderr: ${stderr}`);
//       return;
//     }
//     console.log(`Encryption done: ${stdout}`);
//   });
// };

/**
 * Once a file is uploaded on Cloud storage, encrypt it and
 * move it to Backblaze B2
 * Then delete it from Cloud Storage (too expensive)
 * @see https://firebase.google.com/docs/functions/gcp-storage-events
 * @param {*} object
 */
exports.storageToB2 = async (object) => {
  const fileBucket = object.bucket; // The Storage bucket that contains the file.
  const filePath = object.name; // File path in the bucket.
  const fileName = path.basename(filePath);
  const contentType = object.contentType; // File content type.
  const metageneration = object.metageneration; // Number of times metadata has been generated. New objects have a value of 1.

  console.log('DATA: ', filePath, fileName);
  // Download file from bucket.
  const bucket = admin.storage().bucket(fileBucket);
  const tempFilePath = path.join(os.tmpdir(), fileName);
  const metadata = {
    contentType: contentType,
  };
  await bucket.file(filePath).download({ destination: tempFilePath });
  console.log('File downloaded locally to', tempFilePath);

  // Encryption
  const command = `openssl enc -aes-256-ctr -in ${tempFilePath} -out ${tempFilePath}.kmlg -S ${encryptionSalt} -K ${encryptionKey} -iv ${encryptionIv}`;
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

    // Copy to B2
    b2.authorize(function (err) {
      if (err) {
        throw err;
      }

      console.log('B2 Authorized. Upload starting');
      // Upload encrypted file
      b2.uploadFile(
        tempFilePath + '.lsf',
        {
          bucketId: B2bucketId,
          fileName: filePath + '.lsf',
          // Upload to a directory
          //   fileName: "userfiles/" + thumbFileName,
          contentType: contentType,
        },
        async (err, results) => {
          if (err) console.log('error:', err);

          // Delete file from bucket
          // await bucket.file(filePath).delete();
          // console.log('File deleted from Cloud storage', filePath);

          // Once the files has been uploaded delete the local files to free up disk space.
          fs.unlinkSync(tempFilePath + '.lsf');
          console.log('Encrypted local file deleted', tempFilePath + '.lsf');

          return { message: 'File uploaded!' };
        }
      );

      // Upload non encrypted file
      b2.uploadFile(
        tempFilePath,
        {
          bucketId: B2bucketId,
          fileName: filePath,
          // Upload to a directory
          //   fileName: "userfiles/" + thumbFileName,
          contentType: contentType,
        },
        async (err, results) => {
          if (err) console.log('error:', err);

          // Delete file from bucket
          // await bucket.file(filePath).delete();
          // console.log('File deleted from Cloud storage', filePath);

          // Once the thumbnail has been uploaded delete the local file to free up disk space.
          fs.unlinkSync(tempFilePath);
          console.log('Non encrypted local file deleted', tempFilePath);

          return { message: 'File uploaded!' };
        }
      );
    });
  });
};
