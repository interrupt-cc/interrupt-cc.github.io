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

// Recursively find .m4a files and group by immediate parent folder
function findAudioFiles(dir, trackMap = {}) {
    if (!fs.existsSync(dir)) {
        console.error(`\n[COMPILER_ERROR] Source directory not mounted: ${dir}`);
        return trackMap;
    }
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            findAudioFiles(fullPath, trackMap);
        } else if (fullPath.toLowerCase().endsWith('.m4a')) {
            // Get the name of the immediate parent directory
            const folderName = path.basename(path.dirname(fullPath));
            const webPath = fullPath.replace(/\\/g, '/');
            
            if (!trackMap[folderName]) trackMap[folderName] = [];
            trackMap[folderName].push(webPath);
        }
    }
    return trackMap;
}

console.log(`[TRACK_COMPILER] Grouping physical audio partitions by folder metadata: ${targetDir}/...`);
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
