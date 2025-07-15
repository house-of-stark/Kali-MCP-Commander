// @ts-nocheck
import { describe, it, expect, beforeEach, jest, beforeAll } from '@jest/globals';

// Create mock functions with detailed logging
const mockLog = jest.fn().mockImplementation(async (entry) => {
  console.log('mockAuditLogger.log called with:', JSON.stringify(entry, null, 2));
  return entry;
});

const mockCapture = jest.fn().mockImplementation((...args) => {
  console.log('mockCapture called with:', ...args);
  return Promise.resolve();
});

// Mock the modules before importing the code under test
jest.mock('../src/security/audit-logger.js', () => ({
  auditLogger: {
    log: mockLog
  }
}));

jest.mock('../src/utils/capture.js', () => ({
  capture: mockCapture
}));

// Now import the code under test
import { KaliToolManager } from '../src/tools/kali-tools';
import type { ServerResult } from '../src/types';

// Create a simple mock for child_process.exec
const mockExec = jest.fn((command, options, callback) => {
  if (command.includes('nmap -sS -p 80,443,8080 example.com')) {
    // Successful nmap scan output
    const output = `Starting Nmap 7.80 ( https://nmap.org ) at 2023-04-01 12:00 UTC
Nmap scan report for example.com (93.184.216.34)
Host is up (0.025s latency).
Not shown: 998 filtered ports
PORT    STATE  SERVICE
80/tcp  open   http
443/tcp closed https

Nmap done: 1 IP address (1 host up) scanned in 2.05 seconds`;
    callback(null, { stdout: output, stderr: '' });
  } else if (command.includes('nmap --invalid-flag')) {
    // Failed nmap command (invalid flag)
    const error = new Error('Command failed');
    error.stderr = 'nmap: unrecognized option \'--invalid-flag\'';
    callback(error, { stdout: '', stderr: error.stderr });
  } else {
    // Generic error case
    const error = new Error('Command failed');
    error.stderr = 'Command failed with error';
    callback(error, { stdout: '', stderr: 'Command failed with error' });
  }
  return { on: jest.fn() };
});

// Mock the entire child_process module
jest.mock('child_process', () => ({
  exec: mockExec,
  __esModule: true
}));



describe('KaliToolManager', () => {
  let kaliToolManager: KaliToolManager;

  beforeEach(() => {
    console.log('\n--- Running test setup ---');
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up the exec mock implementation
    mockExec.mockImplementation((command, options, callback) => {
      console.log('mockExec called with command:', command);
      
      if (command.includes('nmap -sS -p 80,443,8080 example.com')) {
        console.log('Mocking successful nmap command');
        callback(null, { 
          stdout: 'nmap scan results...', 
          stderr: '' 
        });
      } else if (command.includes('--invalid-flag')) {
        console.log('Mocking failed nmap command (invalid flag)');
        const error = new Error('Command failed: nmap: unrecognized option');
        error.stderr = 'nmap: unrecognized option';
        callback(error, { stdout: '', stderr: 'nmap: unrecognized option' });
      } else {
        console.log('Mocking generic command failure');
        const error = new Error('Command failed');
        callback(error, { stdout: '', stderr: 'Command failed' });
      }
      return { on: jest.fn() };
    });
    
    // Get a fresh instance of KaliToolManager
    kaliToolManager = KaliToolManager.getInstance();
    
    // Log the current state of mocks for debugging
    console.log('Current mock states:');
    console.log('mockLog.mock.calls.length:', mockLog.mock.calls.length);
    console.log('mockCapture.mock.calls.length:', mockCapture.mock.calls.length);
    console.log('mockExec.mock.calls.length:', mockExec.mock.calls.length);
  });

  describe('listTools', () => {
    it('should list available tools', () => {
      const tools = kaliToolManager.listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // Check that each tool has the required properties
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('args');
        expect(Array.isArray(tool.args)).toBe(true);
      });
    });
  });

  describe('executeTool', () => {
    it('should execute a tool with valid arguments', async () => {
      console.log('\n--- Starting test: should execute a tool with valid arguments ---');
      
      // First, let's check what tools are available and their expected arguments
      const tools = kaliToolManager.listTools();
      console.log('Available tools:', tools);
      
      // Get the nmap tool definition to understand expected arguments
      const nmapTool = tools.find(t => t.name === 'nmap');
      console.log('NMAP tool definition:', JSON.stringify(nmapTool, null, 2));
      
      // Mock the exec function to simulate a successful command execution
      mockExec.mockImplementationOnce((command, options, callback) => {
        console.log('Mock exec called with command:', command);
        callback(null, { 
          stdout: 'Nmap scan report for example.com\nHost is up (0.025s latency).', 
          stderr: '' 
        });
        return { on: jest.fn() };
      });
      
      // Execute with correct argument format based on the tool definition
      const result = await kaliToolManager.executeTool('nmap', {
        target: 'example.com',
        scan_type: '-sS',
        ports: '80,443,8080'
      }, 'test-user');
      
      console.log('Test result:', JSON.stringify(result, null, 2));
      
      // Verify the result
      expect(result.isError).toBe(false);
      expect(result.content[0]).toHaveProperty('type', 'text');
      
      // Verify audit logging was called with the start of execution
      console.log('Checking audit logging calls...');
      console.log('mockLog.mock.calls:', JSON.stringify(mockLog.mock.calls, null, 2));
      
      // Check that the execution started was logged
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_execution_started',
        status: 'success',
        resource: 'nmap',
        userId: 'test-user'
      }));
      
      // Check that the successful execution was logged
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_executed',
        status: 'success',
        resource: 'nmap',
        userId: 'test-user'
      }));
      
      // Verify the command was executed with the correct arguments
      // Note: The actual command will use --target, --scan_type, and --ports flags
      // as defined in the buildCommand method
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/nmap.*--target example\.com.*--scan_type -sS.*--ports 80,443,8080/),
        expect.any(Object),
        expect.any(Function)
      );
      
      console.log('Test completed successfully');
    });

    it('should handle command execution errors', async () => {
      // Mock the exec function to simulate a command failure
      mockExec.mockImplementationOnce((command, options, callback) => {
        console.log('Mock exec called with command (simulating error):', command);
        const error = new Error('Command failed: nmap: unrecognized option');
        error.stderr = 'nmap: unrecognized option';
        callback(error, { stdout: '', stderr: 'nmap: unrecognized option' });
        return { on: jest.fn() };
      });
      
      // Test with invalid nmap arguments that will cause the command to fail
      const result = await kaliToolManager.executeTool('nmap', {
        target: 'example.com',
        scan_type: '--invalid-flag',
        ports: '80,443,8080'
      }, 'test-user');
      
      console.log('Error test result:', JSON.stringify(result, null, 2));
      
      // Verify the error response
      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0].text).toContain('Error executing nmap');
      
      // Verify error was logged to audit log
      // First check that tool_execution_started was called
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_execution_started',
        status: 'success',
        resource: 'nmap',
        userId: 'test-user'
      }));
      
      // Then check that tool_execution_failed was called
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_execution_failed',
        status: 'failure',
        resource: 'nmap',
        metadata: expect.objectContaining({
          args: expect.any(String),
          error: expect.any(String)
        }),
        userId: 'test-user'
      }));
    });

    it('should validate tool arguments', async () => {
      // Test with missing required arguments
      const result = await kaliToolManager.executeTool('nmap', {}, 'test-user');
      
      console.log('Validation test result (missing args):', JSON.stringify(result, null, 2));
      
      // Verify the validation error response
      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0].text).toContain('Missing required argument');
      
      // Verify validation error was logged to audit log
      // First check that tool_execution_started was called
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_execution_started',
        status: 'success',
        resource: 'nmap',
        userId: 'test-user'
      }));
      
      // Then check that tool_execution_failed was called
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_execution_failed',
        status: 'failure',
        resource: 'nmap',
        metadata: expect.objectContaining({
          args: expect.any(String),
          error: expect.stringContaining('Missing required argument')
        }),
        userId: 'test-user'
      }));
      
      // Reset mocks for the next test case
      jest.clearAllMocks();
      
      // Test with invalid argument value
      const result2 = await kaliToolManager.executeTool('nmap', { 
        target: 'example.com',
        scan_type: 'invalid-scan-type' 
      }, 'test-user');
      
      console.log('Validation test result (invalid arg value):', JSON.stringify(result2, null, 2));
      
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Invalid value for scan_type');
      
      // Verify validation error was logged to audit log
      // First check that tool_execution_started was called
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_execution_started',
        status: 'success',
        resource: 'nmap',
        userId: 'test-user'
      }));
      
      // Then check that tool_execution_failed was called
      expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'tool_execution_failed',
        status: 'failure',
        resource: 'nmap',
        metadata: expect.objectContaining({
          args: expect.any(String),
          error: expect.stringContaining('Invalid value for scan_type')
        }),
        userId: 'test-user'
      }));
    });
  });
});
