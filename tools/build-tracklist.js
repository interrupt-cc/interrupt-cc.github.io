// tools/build-tracklist.js
/**
 * STOCHASTIC_AUDIO Asset Compiler
 * Recursively scans the MI+OM+RM source directory for original .m4a audio stems
 * and outputs a JSON tracking manifest for the deterministic browser-player to stream.
 * 
 * Strict compliance: This is a purely non-destructive parser. It does not alter
 * or transcode the source files, complying with preservation limits.
 */

const fs = require('fs');
const path = require('path');

const targetDir = 'MI+OM+RM';
const outputFile = 'js/tracklist.js';

// Recursively find .m4a files
function findAudioFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) {
        console.error(`\n[COMPILER_ERROR] Source directory not mounted: ${dir}`);
        console.error(`\nEnsure you have dropped the physical ${dir} folder into the repository root.\n`);
        return fileList;
    }
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findAudioFiles(filePath, fileList);
        } else if (filePath.toLowerCase().endsWith('.m4a')) {
            // Store path relative to repository root, replacing backslashes for web URLs
            fileList.push(filePath.replace(/\\/g, '/'));
        }
    }
    return fileList;
}

console.log(`[TRACK_COMPILER] Initializing non-destructive scan over physical partition: ${targetDir}/...`);
const tracks = findAudioFiles(targetDir);

if (tracks.length === 0) {
    console.warn(`[TRACK_WARNING] Null yield. No .m4a arrays discovered in the ${targetDir} directory structure.`);
}

// Convert JSON array into a pure ES6 Window global to bypass file:// CORS fetches!
const jsPayload = `// Auto-generated STOCHASTIC_AUDIO manifest
window.STOCHASTIC_TRACKLIST = ${JSON.stringify(tracks, null, 2)};
`;

fs.writeFileSync(outputFile, jsPayload);
console.log(`[PASS] Deterministic payload mapped. Compiled ${tracks.length} track paths to manifest: ${outputFile}`);
