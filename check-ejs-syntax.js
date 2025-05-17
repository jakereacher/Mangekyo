const fs = require('fs');
const path = require('path');

function checkEJSSyntax(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Check for unbalanced EJS tags
    let openTags = 0;
    let problemLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      // Count opening and closing tags
      let pos = 0;
      while (pos < line.length) {
        if (line.substr(pos, 2) === '<%') {
          openTags++;
          pos += 2;
        } else if (line.substr(pos, 2) === '%>') {
          openTags--;
          if (openTags < 0) {
            problemLines.push({
              lineNumber,
              line,
              message: 'Closing EJS tag without matching opening tag'
            });
            openTags = 0; // Reset to avoid cascading errors
          }
          pos += 2;
        } else {
          pos++;
        }
      }
      
      // Check for potential issues within EJS tags
      if (line.includes('<%') && !line.includes('%>')) {
        // This is not necessarily an error, but worth flagging
        problemLines.push({
          lineNumber,
          line,
          message: 'Opening EJS tag without closing tag on the same line (might be closed on another line)'
        });
      }
      
      if (line.includes('%>') && !line.includes('<%')) {
        // This is not necessarily an error, but worth flagging
        problemLines.push({
          lineNumber,
          line,
          message: 'Closing EJS tag without opening tag on the same line (might be opened on another line)'
        });
      }
      
      // Check for potential syntax errors in EJS code
      const ejsBlocks = line.match(/<%.*?%>/g) || [];
      for (const block of ejsBlocks) {
        // Check for unbalanced parentheses within EJS blocks
        const code = block.substring(2, block.length - 2).trim();
        
        // Skip EJS comments and output tags
        if (code.startsWith('-') || code.startsWith('=') || code.startsWith('#')) {
          continue;
        }
        
        let parens = 0;
        for (let j = 0; j < code.length; j++) {
          if (code[j] === '(') parens++;
          if (code[j] === ')') parens--;
          
          if (parens < 0) {
            problemLines.push({
              lineNumber,
              line,
              message: `Unbalanced parentheses in EJS code: ${code}`
            });
            break;
          }
        }
        
        if (parens > 0) {
          problemLines.push({
            lineNumber,
            line,
            message: `Unclosed parentheses in EJS code: ${code}`
          });
        }
      }
    }
    
    if (openTags !== 0) {
      console.error(`Error: Unbalanced EJS tags in the file (${openTags} unclosed tags)`);
    }
    
    if (problemLines.length > 0) {
      console.error('Potential EJS syntax issues:');
      for (const problem of problemLines) {
        console.error(`Line ${problem.lineNumber}: ${problem.message}`);
        console.error(`  ${problem.line}`);
      }
      return false;
    }
    
    console.log('No obvious EJS syntax issues found!');
    return true;
  } catch (err) {
    console.error('Error reading file:', err.message);
    return false;
  }
}

const filePath = path.join(__dirname, 'views', 'user', 'orderDetails.ejs');
checkEJSSyntax(filePath);
