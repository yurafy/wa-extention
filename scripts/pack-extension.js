import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function packExtension() {
  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) {
    console.error('dist directory does not exist! Run npm run build first.');
    process.exit(1);
  }

  const zip = new JSZip();

  function addFolderToZip(folderPath, zipFolder) {
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        addFolderToZip(fullPath, zipFolder.folder(file));
      } else {
        const fileData = fs.readFileSync(fullPath);
        zipFolder.file(file, fileData);
      }
    }
  }

  console.log('Packaging extension files into ZIP archive...');
  addFolderToZip(distDir, zip);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const outputZipPath = path.resolve('wa-business-bulk-chat-media-exporter.zip');
  fs.writeFileSync(outputZipPath, zipBuffer);
  console.log(`Successfully created installable extension ZIP at: ${outputZipPath}`);
}

packExtension().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
