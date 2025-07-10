import { execSync } from 'child_process';
import fs from 'fs';

// Helper function to run shell commands with better error handling
const runCommand = (command, ignoreErrors = false) => {
  try {
    const output = execSync(command, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 30000
    });
    return {
      success: true,
      output: output.trim(),
      error: null
    };
  } catch (error) {
    const result = {
      success: false,
      output: error.stdout?.toString() || '',
      error: error.stderr?.toString() || error.message
    };
    if (!ignoreErrors) {
      console.error(`Command failed: ${command}`);
      console.error('Error:', error.message);
    }
    return result;
  }
};

console.log('=== Docker Diagnostic Check ===');

// 1. Check current user and groups
console.log('\n1. Current User and Groups:');
console.log(`- User: ${process.env.USER}`);
console.log(`- Groups: ${runCommand('groups', true).output}`);

// 2. Check Docker socket permissions
console.log('\n2. Docker Socket Check:');
const socketPath = '/var/run/docker.sock';
const socketExists = fs.existsSync(socketPath);
console.log(`- Socket exists: ${socketExists}`);

if (socketExists) {
  const stats = fs.statSync(socketPath);
  console.log(`- Socket permissions: ${stats.mode.toString(8).slice(-3)}`);
  console.log(`- Socket owner: ${stats.uid}:${stats.gid}`);
  
  // Try to read the socket directly
  try {
    fs.accessSync(socketPath, fs.constants.R_OK | fs.constants.W_OK);
    console.log('- Current process has read/write access to socket');
  } catch (err) {
    console.log(`- Current process does NOT have access to socket: ${err.message}`);
  }
}

// 3. Check Docker context
console.log('\n3. Docker Context:');
const contextResult = runCommand('docker context ls', true);
console.log('- Context list:');
console.log(contextResult.output || '  (No output)');

const currentContext = runCommand('docker context show', true);
console.log(`- Current context: ${currentContext.output || 'unknown'}`);

// 4. Check Docker info
console.log('\n4. Docker Info:');
const infoResult = runCommand('docker info', true);
if (infoResult.success) {
  console.log('- Docker is running and accessible');
  console.log(infoResult.output.split('\n').slice(0, 15).join('\n') + '\n...');
} else {
  console.log('- Could not get Docker info:', infoResult.error);
}

// 5. Try to run a simple Docker command
console.log('\n5. Test Docker Command:');
const testCmd = 'docker run --rm hello-world';
console.log(`- Running: ${testCmd}`);
const testResult = runCommand(testCmd, true);

if (testResult.success) {
  console.log('- Successfully ran hello-world container');
  console.log(testResult.output.split('\n').slice(0, 5).join('\n') + '\n...');
} else {
  console.log('- Failed to run hello-world container');
  console.log('- Error:', testResult.error);
  
  // Try with sudo to see if it's a permission issue
  console.log('\nTrying with sudo...');
  const sudoResult = runCommand(`sudo ${testCmd}`, true);
  if (sudoResult.success) {
    console.log('- Successfully ran with sudo');
    console.log('- This suggests a permission issue with the current user');
  } else {
    console.log('- Also failed with sudo');
    console.log('- Error:', sudoResult.error);
  }
}

console.log('\n=== End of Diagnostic Check ===');
