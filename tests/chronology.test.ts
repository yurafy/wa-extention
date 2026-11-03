import { describe, it, expect } from 'vitest';
import { MessageRecord } from '../src/types';

describe('Message Chronology and Ordering', () => {
  it('should sort messages strictly in chronological ascending order', () => {
    const rawMessages: Partial<MessageRecord>[] = [
      { id: 'm3', timestamp: '2026-10-20T14:35:00Z', text: 'Third' },
      { id: 'm1', timestamp: '2026-10-20T14:30:00Z', text: 'First' },
      { id: 'm4', timestamp: '2026-10-20T15:00:00Z', text: 'Fourth' },
      { id: 'm2', timestamp: '2026-10-20T14:32:00Z', text: 'Second' },
    ];

    const sorted = [...rawMessages].sort(
      (a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    );

    expect(sorted.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('should detect and handle duplicate message IDs gracefully', () => {
    const messages: Partial<MessageRecord>[] = [
      { id: 'm1', timestamp: '2026-10-20T14:30:00Z', text: 'Original text' },
      { id: 'm1', timestamp: '2026-10-20T14:30:00Z', text: 'Edited text' },
      { id: 'm2', timestamp: '2026-10-20T14:31:00Z', text: 'Another message' },
    ];

    const deduplicatedMap = new Map<string, Partial<MessageRecord>>();
    for (const msg of messages) {
      deduplicatedMap.set(msg.id!, msg);
    }

    const uniqueMessages = Array.from(deduplicatedMap.values());
    expect(uniqueMessages.length).toBe(2);
    expect(uniqueMessages.find(m => m.id === 'm1')?.text).toBe('Edited text');
  });
});
