import { test, expect, beforeAll } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const DOCKER_IMAGE_NAME = 'kali-mcp-commander';
const CONTAINER_NAME = 'kali-mcp-commander-test';
let isDockerRunning = false;

// Helper function to run shell commands with better error handling
const runCommand = (command, ignoreErrors = false) => {
  try {
    const output = execSync(command, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 300000 // 5 minute timeout
    });
    return {
      success: true,
      output: output.trim(),
      error: null
    };
  } catch (error) {
    if (ignoreErrors) {
      return {
        success: false,
        output: error.stdout?.toString() || '',
        error: error.stderr?.toString() || error.message
      };
    }
    throw error;
  }
};

// Check if Docker is running and accessible before running tests
beforeAll(() => {
  try {
    // First check if we can access the Docker socket
    const socketCheck = runCommand('ls -l /var/run/docker.sock', true);
    console.log('Docker socket info:', socketCheck.output);
    
    // Then check if we can get Docker info
    const result = runCommand('docker info', true);
    isDockerRunning = result.success;
    
    if (!isDockerRunning) {
      console.warn('Docker is not running or not accessible. Tests requiring Docker will be skipped.');
      console.warn('Docker info error:', result.error || 'No error message');
      
      // Additional diagnostics
      console.log('Current user:', process.env.USER);
      console.log('Current groups:', runCommand('groups', true).output);
      console.log('Docker context:', runCommand('docker context show', true).output);
    } else {
      console.log('Docker is running and accessible');
      console.log('Docker info:', result.output.split('\n').slice(0, 10).join('\n') + '...');
    }
  } catch (error) {
    console.error('Failed to check Docker status:', error);
    console.error('Error details:', error.message);
    if (error.stderr) console.error('stderr:', error.stderr.toString());
    if (error.stdout) console.error('stdout:', error.stdout.toString());
    isDockerRunning = false;
  }
}, 15000);

// Force tests to run regardless of Docker status for now
const testIfDocker = test; // Always run tests

// Log test configuration
console.log('\n=== Test Configuration ===');
console.log(`- Current user: ${process.env.USER}`);
console.log(`- Docker running: ${isDockerRunning}`);
console.log(`- Node version: ${process.version}`);
console.log(`- Platform: ${process.platform}`);
console.log('=========================\n');

testIfDocker('1. Verify build script exists and is executable', () => {
  const buildScript = './build.sh';
  expect(existsSync(buildScript)).toBe(true);
  
  // Check if the script is executable
  const { mode } = require('fs').statSync(buildScript);
  const isExecutable = !!(mode & 0o111); // Check if any execute bit is set
  expect(isExecutable).toBe(true);
});

testIfDocker('2. Verify Docker is installed and running', () => {
  expect(isDockerRunning).toBe(true);
});

testIfDocker('3. Verify docker-compose is installed', () => {
  const result = runCommand('docker-compose --version');
  expect(result.success).toBe(true);
  expect(result.output).toContain('docker-compose');
});

testIfDocker('4. Verify minimal build script completes', async () => {
  console.log('Running minimal build...');
  const result = runCommand('./build.sh minimal');
  
  // Check if the build completed without errors
  expect(result.success).toBe(true);
  expect(result.output).toContain('Minimal build complete');
  
  // Verify Docker image was built
  const imageCheck = runCommand(`docker images -q ${DOCKER_IMAGE_NAME}-minimal`);
  expect(imageCheck.success).toBe(true);
  expect(imageCheck.output).not.toBe('');
  
  console.log('✓ Minimal build completed successfully');
}, 300000); // 5 minute timeout

testIfDocker('5. Verify container starts with docker-compose', async () => {
  // Start the container
  console.log('Starting container with docker-compose...');
  const startResult = runCommand('docker-compose up -d');
  expect(startResult.success).toBe(true);
  
  // Give it some time to start
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Check if container is running
  const psResult = runCommand('docker ps --filter "name=kali-mcp-commander-minimal" --format "{{.Status}}"');
  expect(psResult.success).toBe(true);
  expect(psResult.output).toContain('Up');
  
  console.log('✓ Container started successfully');
}, 60000);

// Cleanup after all tests
afterAll(() => {
  if (!isDockerRunning) return;
  
  console.log('\nCleaning up test resources...');
  
  // Stop and remove test containers
  console.log('Stopping and removing containers...');
  runCommand('docker-compose down', true);
  
  // Remove test images
  console.log('Removing test images...');
  runCommand(`docker rmi -f $(docker images -q ${DOCKER_IMAGE_NAME}-minimal)`, true);
  
  console.log('✓ Cleanup complete');
}, 30000);
