import { test, expect, beforeAll } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the current file and directory names in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants for Docker image and container names
const DOCKER_IMAGE_NAME = 'kali-mcp-commander';
const CONTAINER_NAME = 'kali-mcp-commander-test';
const DOCKER_COMPOSE_FILE = 'docker-compose.yml';
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
  const stats = statSync(buildScript);
  const isExecutable = !!(stats.mode & 0o111); // Check if any execute bit is set
  console.log(`- Build script permissions: ${stats.mode.toString(8)} (octal)`);
  console.log(`- Is executable: ${isExecutable}`);
  expect(isExecutable).toBe(true);
});

testIfDocker('2. Verify Docker is installed and running', () => {
  expect(isDockerRunning).toBe(true);
});

testIfDocker('3. Verify docker compose is installed', () => {
  // Check for the newer 'docker compose' command first
  const result = runCommand('docker compose version', true);
  
  // If that fails, fall back to checking for the older 'docker-compose' command
  if (!result.success) {
    const legacyResult = runCommand('docker-compose --version');
    expect(legacyResult.success).toBe(true);
    expect(legacyResult.output).toContain('docker-compose');
  } else {
    expect(result.output).toContain('Docker Compose version');
  }
});

testIfDocker('4. Verify minimal build script completes', async () => {
  console.log('Running minimal build...');
  const result = runCommand('./build.sh minimal');
  
  // Check if the build completed without errors
  expect(result.success).toBe(true);
  expect(result.output).toContain('Minimal build complete');
  
  // Verify Docker image was built
  const imageCheck = runCommand(`docker images -q ${DOCKER_IMAGE_NAME}:minimal`);
  expect(imageCheck.success).toBe(true);
  expect(imageCheck.output).not.toBe('');
  console.log(`- Image ID: ${imageCheck.output}`);
  
  console.log('✓ Minimal build completed successfully');
}, 300000); // 5 minute timeout

testIfDocker('5. Verify container starts with docker-compose', async () => {
  // Try the newer 'docker compose' command first, fall back to 'docker-compose' if it fails
  console.log('Starting container with docker compose...');
  let startResult = runCommand(`docker compose -f ${DOCKER_COMPOSE_FILE} up -d`, true);
  
  // If the new command fails, try the legacy command
  if (!startResult.success) {
    console.log('New docker compose command failed, trying legacy docker-compose...');
    startResult = runCommand(`docker-compose -f ${DOCKER_COMPOSE_FILE} up -d`);
  }
  
  expect(startResult.success).toBe(true);
  console.log('- Docker Compose output:', startResult.output);
  
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
