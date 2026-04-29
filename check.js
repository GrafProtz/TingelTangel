const fs = require('fs');
const path = require('path');

const files = ['main.js', 'MapData.js', 'MapView.js', 'Game.js'];

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
        new Function(content); // This parses the JS code and throws a SyntaxError if invalid
        console.log(`${file} is syntax-valid (Function parse).`);
    } catch (e) {
        console.error(`SyntaxError in ${file}:`, e.message);
    }
});
