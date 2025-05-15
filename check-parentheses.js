const fs = require('fs');
const path = require('path');

function checkParentheses(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let stack = [];
    let lineNumbers = {};
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '(' || char === '{' || char === '[') {
          stack.push(char);
          if (!lineNumbers[stack.length]) {
            lineNumbers[stack.length] = lineNumber;
          }
        } else if (char === ')' || char === '}' || char === ']') {
          if (stack.length === 0) {
            console.error(`Error: Unexpected closing '${char}' at line ${lineNumber}, position ${j+1}`);
            console.error(`Line content: ${line}`);
            return false;
          }
          
          const lastOpening = stack.pop();
          const expected = 
            lastOpening === '(' ? ')' : 
            lastOpening === '{' ? '}' : 
            lastOpening === '[' ? ']' : null;
          
          if (char !== expected) {
            console.error(`Error: Mismatched brackets at line ${lineNumber}, position ${j+1}`);
            console.error(`Expected '${expected}', but found '${char}'`);
            console.error(`Line content: ${line}`);
            return false;
          }
          
          delete lineNumbers[stack.length + 1];
        }
      }
    }
    
    if (stack.length > 0) {
      console.error(`Error: Unclosed brackets in the file`);
      for (const depth in lineNumbers) {
        console.error(`Unclosed bracket at line ${lineNumbers[depth]}`);
        console.error(`Line content: ${lines[lineNumbers[depth] - 1]}`);
      }
      return false;
    }
    
    console.log('All brackets are properly matched!');
    return true;
  } catch (err) {
    console.error('Error reading file:', err.message);
    return false;
  }
}

const filePath = path.join(__dirname, 'views', 'user', 'orderDetails.ejs');
checkParentheses(filePath);
