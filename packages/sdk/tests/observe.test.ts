import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CognObserve } from '../src/cognobserve';

describe('observe()', () => {
  beforeEach(() => {
    // Initialize with disabled transport to avoid network calls
    CognObserve.init({
      apiKey: 'test_key',
      disabled: true,
    });
  });

  afterEach(async () => {
    await CognObserve.shutdown();
  });

  it('should execute the wrapped function and return its result', async () => {
    const result = await CognObserve.observe('test-operation', async () => {
      return { data: 'hello' };
    });

    expect(result).toEqual({ data: 'hello' });
  });

  it('should work with string name', async () => {
    const result = await CognObserve.observe('simple-name', async () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  it('should work with options object', async () => {
    const result = await CognObserve.observe(
      {
        name: 'options-test',
        type: 'span',
        metadata: { key: 'value' },
      },
      async () => {
        return 'success';
      }
    );

    expect(result).toBe('success');
  });

  it('should propagate errors', async () => {
    await expect(
      CognObserve.observe('error-test', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');
  });

  it('should support nested observe calls', async () => {
    const calls: string[] = [];

    await CognObserve.observe('parent', async () => {
      calls.push('parent-start');

      await CognObserve.observe('child-1', async () => {
        calls.push('child-1');
      });

      await CognObserve.observe('child-2', async () => {
        calls.push('child-2');
      });

      calls.push('parent-end');
    });

    expect(calls).toEqual(['parent-start', 'child-1', 'child-2', 'parent-end']);
  });

  it('should handle async operations correctly', async () => {
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const start = Date.now();
    await CognObserve.observe('async-test', async () => {
      await sleep(50);
    });
    const duration = Date.now() - start;

    // Allow 5ms tolerance for timing imprecision
    expect(duration).toBeGreaterThanOrEqual(45);
  });

  it('should work with type="generation"', async () => {
    const mockLLMResponse = {
      id: 'test-123',
      model: 'gpt-4',
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };

    const result = await CognObserve.observe(
      { name: 'llm-call', type: 'generation' },
      async () => mockLLMResponse
    );

    expect(result).toEqual(mockLLMResponse);
  });
});

describe('log()', () => {
  beforeEach(() => {
    CognObserve.init({
      apiKey: 'test_key',
      disabled: true,
    });
  });

  afterEach(async () => {
    await CognObserve.shutdown();
  });

  it('should log within observe context', async () => {
    await CognObserve.observe('log-test', async () => {
      CognObserve.log('Test message', { step: 1 });
      CognObserve.log('Another message', { step: 2 }, 'WARNING');
    });
    // No error thrown means success
  });

  it('should handle log outside context', () => {
    // Should not throw
    CognObserve.log('Outside context');
  });
});
