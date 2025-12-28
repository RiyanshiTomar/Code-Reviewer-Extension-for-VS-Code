import MistralClient from "@mistralai/mistralai";
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.error(
    "Missing Mistral API key. Set MISTRAL_API_KEY in your environment."
  );
  process.exit(1);
}

const ai = new MistralClient(apiKey);

// Simple function to review code without complex tool usage
async function reviewCode(code, filePath) {
  try {
    const response = await ai.chat({
      model: "mistral-large-latest",
      messages: [
        {
          role: 'system',
          content: `You are an expert code reviewer. Analyze the following code for potential issues, bugs, security vulnerabilities, and code quality improvements. Provide specific suggestions with line numbers where applicable. Focus on:
- Security vulnerabilities
- Performance issues
- Code style and best practices
- Potential bugs
- Maintainability
- Documentation`
        },
        {
          role: 'user',
          content: `Please review this code file (${filePath}):\n\n${code}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error during code review:', error.message);
    return null;
  }
}

function handleApiError(error) {
  const message = error?.message || "Unknown error";
  if (message.includes("API key")) {
    console.error("Mistral API key is missing or invalid. Set MISTRAL_API_KEY before running.");
  } else {
    console.error("Mistral API error:", message);
  }
  process.exit(1);
}

//Simple function to list files
async function listFiles(directory) {
  const files = [];
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.yaml', '.yml'];

  try {
    if (!fs.existsSync(directory)) {
      throw new Error(`Directory does not exist: ${directory}`);
    }
    
    function scan(dir) {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);

        // Skip noisy build artifacts and hidden files
        if (
          fullPath.includes('node_modules') ||
          fullPath.includes('dist') ||
          fullPath.includes('build') ||
          fullPath.includes('.git') ||
          item.startsWith('.')
        ) {
          continue;
        }

        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scan(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    scan(directory);
    console.log(`Found ${files.length} files`);
    return files;
  } catch (error) {
    console.error(`Error scanning directory ${directory}:`, error.message);
    return [];
  }
}

//read file function
async function readFile(file_path){
  try {
    if (!fs.existsSync(file_path)) {
      throw new Error(`File does not exist: ${file_path}`);
    }
    
    const stats = fs.statSync(file_path);
    if (stats.size > 10 * 1024 * 1024) { // 10MB limit
      throw new Error(`File too large to process: ${file_path}`);
    }
    
    const content = fs.readFileSync(file_path, 'utf-8');
    console.log(`Reading: ${file_path}`);
    return content;
  } catch (error) {
    console.error(`Error reading file ${file_path}:`, error.message);
    return '';
  }
}

async function writeFile(file_path, content){
  try {
    // Validate file path
    const dir = path.dirname(file_path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Validate content
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    
    fs.writeFileSync(file_path, content, 'utf-8');
    console.log(`Fixed: ${file_path}`);
    return true;
  } catch (error) {
    console.error(`Error writing file ${file_path}:`, error.message);
    return false;
  }
}

// We're not using the tool-based approach for Mistral API
// Using direct file processing instead

//main function...
export async function runAgent(directoryPath) {
  console.log(`🔍 Reviewing: ${directoryPath}\n`);
  
  try {
    // Get all files to review
    const files = await listFiles(directoryPath);
    
    if (files.length === 0) {
      console.log('No files found to review');
      return;
    }
    
    console.log(`Found ${files.length} files to review`);
    
    let reviewResults = [];
    
    // Process each file
    for (const filePath of files) {
      console.log(`\n📄 Reviewing: ${filePath}`);
      
      const content = await readFile(filePath);
      
      if (!content) {
        console.log(`Skipping ${filePath} due to read error`);
        continue;
      }
      
      // Skip large files
      if (content.length > 50000) { // 50KB limit
        console.log(`Skipping ${filePath} - too large`);
        continue;
      }
      
      // Review the code
      const review = await reviewCode(content, filePath);
      
      if (review) {
        reviewResults.push({
          file: filePath,
          review: review
        });
        
        console.log(`Review completed for: ${path.basename(filePath)}`);
      } else {
        console.log(`Failed to review: ${filePath}`);
      }
    }
    
    // Generate summary report
    console.log('\n CODE REVIEW COMPLETE');
    console.log(`\nTotal Files Analyzed: ${reviewResults.length}`);
    
    // Display individual reviews
    for (const result of reviewResults) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`File: ${result.file}`);
      console.log(`${'='.repeat(50)}`);
      console.log(result.review);
    }
    
  } catch (error) {
    console.error('Error during code review:', error.message);
    handleApiError(error);
  }
}

// node agent.js ../tester

const directory = process.argv[2] || '.';

await runAgent(directory);