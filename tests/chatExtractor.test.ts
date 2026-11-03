import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('chatExtractor Live DOM Emulation Test', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="app">
            <div id="side">
              <!-- Search bar with leftover text -->
              <div class="search-container">
                <button aria-label="Retour"><span data-icon="back"></span></button>
                <div contenteditable="true" data-tab="3" role="textbox">
                  +212 611-859906+212 611-859906SafwanSafwan
                </div>
              </div>

              <!-- Chat list container -->
              <div id="pane-side" style="height: 500px; overflow-y: scroll;">
                <div role="row" data-id="212611859906@c.us">
                  <div role="gridcell">
                    <div data-testid="cell-frame-title">
                      <span dir="auto" title="+212 611-859906">+212 611-859906</span>
                    </div>
                  </div>
                </div>

                <div role="row" data-id="name_Safwan_1826010068">
                  <div role="gridcell">
                    <div data-testid="cell-frame-title">
                      <span dir="auto" title="Safwan">Safwan</span>
                    </div>
                  </div>
                </div>

                <div role="row" data-id="name__Sky_Job_599383824">
                  <div role="gridcell">
                    <div data-testid="cell-frame-title">
                      <span dir="auto" title="@Sky.Job">@Sky.Job</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Main chat window -->
            <div id="main">
              <header>
                <img src="https://pps.whatsapp.net/v/t61.24694-24/sample?u=212611859906%40c.us" />
                <div role="button">
                  <span dir="auto" title="Safwan">Safwan</span>
                </div>
              </header>

              <!-- Messages conversation panel -->
              <div class="copyable-area">
                <div tabindex="0" style="height: 600px; overflow-y: scroll;">
                  <!-- Message 1: Incoming text from customer -->
                  <div data-id="false_212611859906@c.us_3EB01" class="message-in" role="row">
                    <span data-pre-plain-text="[14:30, 03/11/2026] Safwan: ">
                      Salam khoya, bghit had l-produit
                    </span>
                  </div>

                  <!-- Message 2: Outgoing image from business -->
                  <div data-id="true_212611859906@c.us_3EB02" class="message-out" role="row">
                    <span data-icon="msg-dblcheck"></span>
                    <img src="data:image/jpeg;base64,sample_jpeg_data" />
                    <span class="selectable-text">Marhba khoya ha hwa</span>
                  </div>

                  <!-- Message 3: Incoming audio/voice note -->
                  <div data-id="false_212611859906@c.us_3EB03" role="row">
                    <audio src="data:audio/ogg;base64,sample_audio_data"></audio>
                    <button data-testid="audio-play"></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `, { url: 'https://web.whatsapp.com/' });

    // Set globals for test
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).PointerEvent = dom.window.MouseEvent;
    (globalThis as any).MouseEvent = dom.window.MouseEvent;
    (globalThis as any).KeyboardEvent = dom.window.KeyboardEvent;
    (globalThis as any).InputEvent = dom.window.Event;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).HTMLImageElement = dom.window.HTMLImageElement;
    (globalThis as any).HTMLVideoElement = dom.window.HTMLVideoElement;
    (globalThis as any).HTMLAudioElement = dom.window.HTMLAudioElement;
  });

  it('clearSearchBarIfActive should dismiss search and wipe stuck input text', async () => {
    const { clearSearchBarIfActive } = await import('../src/content/chatExtractor');
    
    const searchInput = dom.window.document.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(searchInput?.textContent?.trim()).toContain('+212 611-859906');

    await clearSearchBarIfActive();

    expect(searchInput?.textContent?.trim()).toBe('');
  });

  it('openConversationInDOM should find and click target chat row', async () => {
    const { openConversationInDOM } = await import('../src/content/chatExtractor');

    const opened = await openConversationInDOM('Safwan', undefined, 'name_Safwan_1826010068');
    expect(opened).toBe(true);
  });

  it('resolveOpenChatPhoneNumber should extract phone number from avatar query parameter', async () => {
    const { resolveOpenChatPhoneNumber } = await import('../src/content/chatExtractor');

    const phone = await resolveOpenChatPhoneNumber('Safwan');
    expect(phone).toBe('+212611859906');
  });

  it('extractMessagesFromOpenChat should extract all 3 messages with sender and media', async () => {
    const { extractMessagesFromOpenChat } = await import('../src/content/chatExtractor');

    const result = await extractMessagesFromOpenChat();
    
    expect(result.messages.length).toBe(3);

    // Msg 1 check
    const msg1 = result.messages.find(m => m.id === 'false_212611859906@c.us_3EB01');
    expect(msg1).toBeDefined();
    expect(msg1?.sender).toBe('customer');
    expect(msg1?.text).toBe('Salam khoya, bghit had l-produit');
    expect(msg1?.type).toBe('text');
    expect(msg1?.timestamp).toContain('2026-11-03');

    // Msg 2 check (image from business)
    const msg2 = result.messages.find(m => m.id === 'true_212611859906@c.us_3EB02');
    expect(msg2).toBeDefined();
    expect(msg2?.sender).toBe('business');
    expect(msg2?.type).toBe('image');
    expect(msg2?.text).toBe('Marhba khoya ha hwa');
    expect(msg2?.mediaPath).toContain('media/images/');
    expect(msg2?.deliveryStatus).toBe('read');

    // Msg 3 check (audio voice note)
    const msg3 = result.messages.find(m => m.id === 'false_212611859906@c.us_3EB03');
    expect(msg3).toBeDefined();
    expect(msg3?.sender).toBe('customer');
    expect(msg3?.type).toBe('audio');
    expect(msg3?.mediaPath).toContain('media/audio/');
  });
});
