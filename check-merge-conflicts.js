const fs = require('fs');
const path = require('path');

function checkMergeConflicts(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    const conflictMarkers = ['<<<<<<<', '=======', '>>>>>>>'];
    let foundConflicts = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      for (const marker of conflictMarkers) {
        if (line.includes(marker)) {
          console.error(`Found merge conflict marker '${marker}' at line ${lineNumber}`);
          console.error(`Line content: ${line}`);
          
          // Show context (5 lines before and after)
          const startLine = Math.max(0, i - 5);
          const endLine = Math.min(lines.length - 1, i + 5);
          
          console.error('\nContext:');
          for (let j = startLine; j <= endLine; j++) {
            const indicator = j === i ? '>>> ' : '    ';
            console.error(`${indicator}${j + 1}: ${lines[j]}`);
          }
          console.error('\n');
          
          foundConflicts = true;
        }
      }
    }
    
    if (!foundConflicts) {
      console.log('No merge conflict markers found in the file!');
      return true;
    }
    
    return false;
  } catch (err) {
    console.error('Error reading file:', err.message);
    return false;
  }
}

const filePath = path.join(__dirname, 'views', 'user', 'orderDetails.ejs');
checkMergeConflicts(filePath);
