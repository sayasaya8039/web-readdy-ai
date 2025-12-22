/**
 * Web Readdy AI - メインエントリーポイント
 *
 * Hono + TypeScript + Cloudflare Workers
 * AIでWebサイトを生成するサービス（readdy.ai風レイアウト）
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'

// アプリケーション初期化
const app = new Hono()

// 環境変数の型定義
type Env = {
  KV?: KVNamespace
  R2?: R2Bucket
}

// ミドルウェア設定
app.use('*', logger())
app.use('*', cors())
app.use('*', prettyJSON())

// ルート定義

// ヘルスチェック
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: '1.0.0' })
})

// メインページ
app.get('/', (c) => {
  const html = getMainPageHTML()
  return c.html(html)
})

// main.jsの配信
app.get('/static/main.js', (c) => {
  const js = getMainJS()
  return c.text(js, 200, {
    'Content-Type': 'text/javascript; charset=utf-8'
  })
})

// API: Webサイト生成エンドポイント
app.post('/api/generate', async (c) => {
  try {
    const { prompt, aiProvider, apiKey, images } = await c.req.json()

    // AIプロバイダーに応じて適切なサービスを選択
    const code = await generateWebsite(prompt, aiProvider, apiKey, images)

    return c.json({
      success: true,
      code: code
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, 500)
  }
})

/**
 * Webサイト生成処理（AI API連携）
 */
async function generateWebsite(
  prompt: string,
  aiProvider: string,
  apiKey: string,
  images?: Array<{ name: string; type: string; data: string }>
): Promise<string> {
  // プロンプトに画像情報を追加
  let fullPrompt = `ユーザーが作りたいWebサイトについて説明しています。
以下の要件を満たす、完全で実用的なHTMLファイル（1つのファイルにCSSとJavaScriptを含む）を作成してください。

【要件】
- HTML5、CSS、JavaScriptを1つのファイルにまとめる
- Tailwind CSSをCDNから読み込む（<script src="https://cdn.tailwindcss.com"></script>）
- レスポンシブデザインに対応する
- モダンなデザインにする（丸みを帯びた形状、柔らかい色使い）
- 色はパステルカラー（水色系）を基調にする

【ユーザーの要望】
${prompt}

${images && images.length > 0 ? `
【参考画像】
ユーザーが${images.length}枚の画像をアップロードしました。これらの画像の雰囲気をデザインに反映させてください。
画像自体はHTMLに埋め込まず、デザインの参考として使用してください。
` : ''}

【出力形式】
HTMLのコードのみを出力してください。説明文やコードブロック（\`\`\`）は不要です。`

  // AIプロバイダーに応じてAPIリクエストを作成
  let htmlCode = ''

  switch (aiProvider) {
    case 'openai':
      htmlCode = await callOpenAI(apiKey, fullPrompt)
      break
    case 'gemini':
      htmlCode = await callGemini(apiKey, fullPrompt)
      break
    case 'claude':
      htmlCode = await callClaude(apiKey, fullPrompt)
      break
    default:
      throw new Error('未対応のAIプロバイダーです')
  }

  return htmlCode
}

/**
 * OpenAI API呼び出し（GPT-4.1）
 */
async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: 'あなたは優秀なWeb開発者です。ユーザーの要望に合わせて、美しいWebサイトを作成してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 8000
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API Error: ${error}`)
  }

  const data = await response.json() as any
  const code = data.choices[0]?.message?.content || ''

  return extractCode(code)
}

/**
 * Google Gemini API呼び出し（Gemini 2.5 Flash）
 */
async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8000
      }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API Error: ${error}`)
  }

  const data = await response.json() as any
  const code = data.candidates[0]?.content?.parts[0]?.text || ''

  return extractCode(code)
}

/**
 * Anthropic Claude API呼び出し（Claude Opus 4.5）
 */
async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      system: 'あなたは優秀なWeb開発者です。ユーザーの要望に合わせて、美しいWebサイトを作成してください。',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API Error: ${error}`)
  }

  const data = await response.json() as any
  const code = data.content[0]?.text || ''

  return extractCode(code)
}

/**
 * コードブロックのみを抽出
 */
function extractCode(text: string): string {
  const codeBlockMatch = text.match(/```(?:html)?\n([\s\S]+?)\n```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  const htmlMatch = text.match(/<!DOCTYPE html[\s\S]+?<\/html>/i)
  if (htmlMatch) {
    return htmlMatch[0]
  }

  return text.trim()
}

/**
 * メインページのHTML（readdy.ai風レイアウト）
 */
function getMainPageHTML(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Web Readdy AI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
    .chat-message {
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .file-operation-item {
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-10px); }
      to { opacity: 1; transform: translateX(0); }
    }
  </style>
</head>
<body class="bg-slate-100">
  <!-- トップナビゲーションバー -->
  <nav class="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4">
    <!-- プロジェクト名 -->
    <div class="flex items-center gap-2">
      <button class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
        <span class="font-medium text-slate-700">My First Project</span>
        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
    </div>

    <!-- メニューボタン群 -->
    <div class="flex items-center gap-1">
      <button class="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1">
        Integrations
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <button class="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">Form</button>
      <button class="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">SEO</button>
      <button class="px-3 py-1.5 rounded-lg text-sm text-purple-600 hover:bg-purple-50 transition-colors">Readdy Agent</button>
    </div>

    <!-- 右側 -->
    <div class="flex-1"></div>
    <div class="flex items-center gap-3">
      <!-- Publishボタン -->
      <button class="px-4 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors">
        Publish
      </button>
      <!-- ヘルプ -->
      <button class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </button>
      <!-- ユーザーアイコン -->
      <button class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
        U
      </button>
    </div>
  </nav>

  <!-- メインコンテンツ -->
  <div class="flex h-[calc(100vh-3.5rem)]">
    <!-- 左側：プレビューエリア -->
    <div class="flex-1 flex flex-col bg-slate-200">
      <!-- ブラウザ風アドレスバー -->
      <div class="h-12 bg-white border-b border-slate-200 flex items-center px-4 gap-3">
        <div class="flex items-center gap-1">
          <button class="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <button class="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <button class="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
        <!-- アドレスバー風 -->
        <div class="flex-1 flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-500">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <span>Readdy Site /</span>
        </div>
        <!-- ビューポート切り替え -->
        <div class="flex items-center gap-1">
          <button onclick="setViewMode('desktop')" id="view-desktop" class="view-mode-btn px-2 py-1 rounded text-sm transition-colors bg-slate-200 text-slate-700">🖥️</button>
          <button onclick="setViewMode('tablet')" id="view-tablet" class="view-mode-btn px-2 py-1 rounded text-sm transition-colors text-slate-400 hover:bg-slate-200">📱</button>
          <button onclick="setViewMode('mobile')" id="view-mobile" class="view-mode-btn px-2 py-1 rounded text-sm transition-colors text-slate-400 hover:bg-slate-200">📱</button>
          <button class="px-2 py-1 rounded text-sm text-slate-400 hover:bg-slate-200 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
            </svg>
          </button>
        </div>
        <!-- コード表示切替 -->
        <button onclick="toggleCodeView()" class="px-2 py-1 rounded text-sm text-slate-400 hover:bg-slate-200 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
          </svg>
        </button>
      </div>

      <!-- プレビュー本体 -->
      <div class="flex-1 p-6 flex items-center justify-center">
        <div id="preview-container" class="bg-white rounded-lg shadow-lg w-full h-full overflow-hidden transition-all duration-300">
          <!-- 初期表示 -->
          <div id="preview-placeholder" class="h-full flex flex-col items-center justify-center text-slate-400">
            <div class="text-6xl mb-4">🎨</div>
            <p class="text-lg">チャットでWebサイトを作成しましょう</p>
            <p class="text-sm mt-2">右側のパネルから説明を入力してください</p>
          </div>
          <!-- プレビューiframe -->
          <iframe id="preview-iframe" class="w-full h-full hidden" sandbox="allow-same-origin"></iframe>
          <!-- コード表示 -->
          <pre id="code-display" class="w-full h-full p-4 bg-slate-800 text-slate-100 text-sm overflow-auto hidden"><code></code></pre>
        </div>
      </div>
    </div>

    <!-- 右側：チャットパネル -->
    <div class="w-96 bg-white border-l border-slate-200 flex flex-col">
      <!-- チャットヘッダー -->
      <div class="h-14 border-b border-slate-200 flex items-center px-4">
        <h2 class="font-medium text-slate-700">Chat</h2>
      </div>

      <!-- チャットメッセージエリア -->
      <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4">
        <!-- ウェルカムメッセージ -->
        <div class="chat-message">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm flex-shrink-0">R</div>
            <div class="flex-1">
              <p class="text-sm text-slate-600">こんにちは！Readdy AIです。作りたいWebサイトについて教えてください。</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ファイル操作表示エリア -->
      <div id="file-operations" class="hidden border-t border-slate-200 p-3 bg-slate-50 max-h-40 overflow-y-auto">
        <div class="text-xs text-slate-500 mb-2">ファイル操作:</div>
        <div id="file-operations-list" class="space-y-1"></div>
      </div>

      <!-- 設定エリア（AIプロバイダー・APIキー） -->
      <div id="settings-area" class="border-t border-slate-200 p-4">
        <details class="group">
          <summary class="cursor-pointer text-sm text-slate-500 hover:text-slate-700 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            設定（AIプロバイダー・APIキー）
          </summary>
          <div class="mt-3 space-y-3">
            <!-- AIプロバイダー選択 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-2">AIプロバイダー</label>
              <div class="flex gap-2">
                <label class="flex-1">
                  <input type="radio" name="ai-provider" value="openai" checked class="peer hidden" />
                  <div class="px-3 py-2 text-center text-xs rounded-lg border border-slate-200 cursor-pointer peer-checked:border-purple-500 peer-checked:bg-purple-50 peer-checked:text-purple-600 transition-colors">
                    OpenAI
                  </div>
                </label>
                <label class="flex-1">
                  <input type="radio" name="ai-provider" value="gemini" class="peer hidden" />
                  <div class="px-3 py-2 text-center text-xs rounded-lg border border-slate-200 cursor-pointer peer-checked:border-purple-500 peer-checked:bg-purple-50 peer-checked:text-purple-600 transition-colors">
                    Gemini
                  </div>
                </label>
                <label class="flex-1">
                  <input type="radio" name="ai-provider" value="claude" class="peer hidden" />
                  <div class="px-3 py-2 text-center text-xs rounded-lg border border-slate-200 cursor-pointer peer-checked:border-purple-500 peer-checked:bg-purple-50 peer-checked:text-purple-600 transition-colors">
                    Claude
                  </div>
                </label>
              </div>
            </div>
            <!-- APIキー入力 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-2">APIキー</label>
              <input type="password" id="api-key-input" placeholder="sk-..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
        </details>
      </div>

      <!-- 入力エリア -->
      <div class="border-t border-slate-200 p-4">
        <!-- ツールバー -->
        <div class="flex items-center gap-2 mb-3">
          <button class="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded transition-colors flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/>
            </svg>
            Selector
          </button>
          <button onclick="document.getElementById('file-upload').click()" class="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded transition-colors flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            画像
          </button>
          <input type="file" accept="image/*,.pdf" multiple class="hidden" id="file-upload" />
        </div>

        <!-- テキストエリア -->
        <textarea id="prompt-input" placeholder="Tell me what to change, specific and clear. One task at a time." rows="3" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"></textarea>

        <!-- アップロードファイル表示 -->
        <div id="uploaded-files" class="mt-2 flex flex-wrap gap-1"></div>

        <!-- 送信ボタン -->
        <button id="send-btn" onclick="handleSend()" class="mt-3 w-full py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2" disabled>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
          </svg>
          送信
        </button>
      </div>
    </div>
  </div>

  <script src="/static/main.js"><\/script>
</body>
</html>`
}

/**
 * クライアントサイドスクリプト
 */
function getMainJS(): string {
  return `// クライアントサイドスクリプト
const state = {
  aiProvider: localStorage.getItem('aiProvider') || 'openai',
  apiKey: localStorage.getItem('apiKey') || '',
  uploadedFiles: [],
  generatedCode: null,
  isGenerating: false,
  currentViewMode: 'desktop',
  showCode: false
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners()
  loadSettings()
  updateUI()
})

function initEventListeners() {
  // AIプロバイダー選択
  document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.aiProvider = e.target.value
      localStorage.setItem('aiProvider', e.target.value)
    })
  })

  // APIキー入力
  const apiKeyInput = document.getElementById('api-key-input')
  if (apiKeyInput) {
    apiKeyInput.value = state.apiKey
    apiKeyInput.addEventListener('input', (e) => {
      state.apiKey = e.target.value
      localStorage.setItem('apiKey', e.target.value)
    })
  }

  // プロンプト入力
  const textarea = document.getElementById('prompt-input')
  if (textarea) {
    textarea.addEventListener('input', updateSendButton)
  }

  // ファイルアップロード
  const fileInput = document.getElementById('file-upload')
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload)
  }
}

function loadSettings() {
  // AIプロバイダーを復元
  const providerRadio = document.querySelector(\`input[name="ai-provider"][value="\${state.aiKey || 'openai'}"]\`)
  if (providerRadio) {
    providerRadio.checked = true
  }
}

function updateUI() {
  updateSendButton()
}

function updateSendButton() {
  const textarea = document.getElementById('prompt-input')
  const btn = document.getElementById('send-btn')
  if (!btn || !textarea) return

  btn.disabled = !textarea.value.trim() || state.isGenerating
  btn.innerHTML = state.isGenerating
    ? '<span class="animate-spin">⏳</span> 生成中...'
    : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> 送信'
}

function handleFileUpload(e) {
  const files = Array.from(e.target.files || [])
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
  const validFiles = files.filter(f => allowedTypes.includes(f.type))
  state.uploadedFiles = [...state.uploadedFiles, ...validFiles]
  updateUploadedFilesDisplay()
}

function updateUploadedFilesDisplay() {
  const container = document.getElementById('uploaded-files')
  if (!container) return

  container.innerHTML = state.uploadedFiles.map((file, index) => \`
    <span class="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">
      \${file.type.startsWith('image/') ? '🖼️' : '📄'}
      \${file.name}
      <button onclick="removeFile(\${index})" class="ml-1 text-slate-400 hover:text-red-500">×</button>
    </span>
  \`).join('')
}

window.removeFile = function(index) {
  state.uploadedFiles = state.uploadedFiles.filter((_, i) => i !== index)
  updateUploadedFilesDisplay()
}

async function handleSend() {
  const textarea = document.getElementById('prompt-input')
  const prompt = textarea?.value.trim()

  if (!prompt) {
    alert('プロンプトを入力してください')
    return
  }
  if (!state.apiKey) {
    alert('設定からAPIキーを入力してください')
    return
  }

  state.isGenerating = true
  updateSendButton()

  // ユーザーメッセージを追加
  addChatMessage('user', prompt)

  try {
    const imageData = await Promise.all(
      state.uploadedFiles
        .filter(f => f.type.startsWith('image/'))
        .map(async f => {
          const base64 = await fileToBase64(f)
          return { name: f.name, type: f.type, data: base64 }
        })
    )

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        aiProvider: state.aiProvider,
        apiKey: state.apiKey,
        images: imageData
      })
    })

    const data = await response.json()

    if (data.success) {
      state.generatedCode = data.code

      // AI応答メッセージ
      addChatMessage('ai', 'Webサイトを生成しました！')

      // ファイル操作表示
      showFileOperations([
        { type: 'created', path: 'index.html' }
      ])

      // プレビュー更新
      updatePreview()
    } else {
      addChatMessage('ai', 'エラー: ' + data.error)
    }
  } catch (error) {
    console.error('Error:', error)
    addChatMessage('ai', 'エラーが発生しました: ' + error.message)
  } finally {
    state.isGenerating = false
    updateSendButton()

    // テキストエリアをクリア
    if (textarea) textarea.value = ''
  }
}

function addChatMessage(role, text) {
  const container = document.getElementById('chat-messages')
  if (!container) return

  const messageDiv = document.createElement('div')
  messageDiv.className = 'chat-message'

  if (role === 'user') {
    messageDiv.innerHTML = \`
      <div class="flex items-start gap-3 justify-end">
        <div class="max-w-[80%] px-3 py-2 bg-purple-500 text-white rounded-2xl rounded-tr-sm">
          <p class="text-sm">\${escapeHtml(text)}</p>
        </div>
      </div>
    \`
  } else {
    messageDiv.innerHTML = \`
      <div class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm flex-shrink-0">R</div>
        <div class="flex-1">
          <p class="text-sm text-slate-600">\${escapeHtml(text)}</p>
        </div>
      </div>
    \`
  }

  container.appendChild(messageDiv)
  container.scrollTop = container.scrollHeight
}

function showFileOperations(operations) {
  const container = document.getElementById('file-operations')
  const list = document.getElementById('file-operations-list')
  if (!container || !list) return

  container.classList.remove('hidden')
  list.innerHTML = operations.map(op => \`
    <div class="file-operation-item flex items-center gap-2 text-xs text-slate-600">
      <span class="\${op.type === 'created' ? 'text-green-500' : 'text-blue-500'}">
        \${op.type === 'created' ? '✓' : '✏'}
      </span>
      <span>\${op.type === 'created' ? 'File Created' : 'File Modified'}</span>
      <span class="font-mono text-slate-400">\${op.path}</span>
    </div>
  \`).join('')
}

function updatePreview() {
  const placeholder = document.getElementById('preview-placeholder')
  const iframe = document.getElementById('preview-iframe')
  const codeDisplay = document.getElementById('code-display')

  if (!state.generatedCode) return

  if (placeholder) placeholder.classList.add('hidden')
  if (iframe) {
    iframe.classList.remove('hidden')
    iframe.srcdoc = state.generatedCode
  }
  if (codeDisplay) codeDisplay.classList.add('hidden')
}

window.setViewMode = function(mode) {
  state.currentViewMode = mode
  const container = document.getElementById('preview-container')
  if (!container) return

  // ボタンのスタイル更新
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.className = 'view-mode-btn px-2 py-1 rounded text-sm transition-colors text-slate-400 hover:bg-slate-200'
  })
  const activeBtn = document.getElementById('view-' + mode)
  if (activeBtn) {
    activeBtn.className = 'view-mode-btn px-2 py-1 rounded text-sm transition-colors bg-slate-200 text-slate-700'
  }

  // コンテナのサイズ変更
  switch (mode) {
    case 'desktop':
      container.style.maxWidth = '100%'
      break
    case 'tablet':
      container.style.maxWidth = '768px'
      break
    case 'mobile':
      container.style.maxWidth = '375px'
      break
  }
}

window.toggleCodeView = function() {
  state.showCode = !state.showCode
  const placeholder = document.getElementById('preview-placeholder')
  const iframe = document.getElementById('preview-iframe')
  const codeDisplay = document.getElementById('code-display')

  if (state.showCode) {
    if (placeholder) placeholder.classList.add('hidden')
    if (iframe) iframe.classList.add('hidden')
    if (codeDisplay) {
      codeDisplay.classList.remove('hidden')
      codeDisplay.querySelector('code').textContent = state.generatedCode || ''
    }
  } else {
    updatePreview()
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

window.handleSend = handleSend
window.removeFile = removeFile
window.setViewMode = setViewMode
window.toggleCodeView = toggleCodeView
`
}

export default app
