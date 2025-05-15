const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

try {
  const filePath = path.join(__dirname, 'views', 'user', 'orderDetails.ejs');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  // Try to compile the EJS template
  ejs.compile(fileContent);
  
  console.log('EJS file compiled successfully!');
} catch (err) {
  console.error('EJS compilation error:', err.message);
  
  if (err.line) {
    console.error('Error at line:', err.line);
    
    // Get the problematic line and surrounding lines for context
    try {
      const filePath = path.join(__dirname, 'views', 'user', 'orderDetails.ejs');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n');
      
      const startLine = Math.max(1, err.line - 5);
      const endLine = Math.min(lines.length, err.line + 5);
      
      console.error('\nContext:');
      for (let i = startLine; i <= endLine; i++) {
        const indicator = i === err.line ? '>>> ' : '    ';
        console.error(`${indicator}${i}: ${lines[i-1]}`);
      }
    } catch (contextErr) {
      console.error('Could not provide context:', contextErr.message);
    }
  }
}
