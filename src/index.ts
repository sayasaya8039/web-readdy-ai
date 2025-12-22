/**
 * Web Readdy AI - メインエントリーポイント
 *
 * Hono + TypeScript + Cloudflare Workers
 * AIでWebサイトを生成するサービス
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
- ダークモードには対応しなくて良い
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
      model: 'gpt-4.1', // 最新モデル（2025年4月リリース）
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

  // コードブロックのみを抽出
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
      model: 'claude-opus-4-5', // 最新モデル（2025年11月リリース）
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
  // markdownのコードブロックを抽出
  const codeBlockMatch = text.match(/```(?:html)?\n([\s\S]+?)\n```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // HTMLタグを含む部分を抽出
  const htmlMatch = text.match(/<!DOCTYPE html[\s\S]+?<\/html>/i)
  if (htmlMatch) {
    return htmlMatch[0]
  }

  // どちらも見つからない場合はそのまま返す
  return text.trim()
}

/**
 * メインページのHTML
 */
function getMainPageHTML(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Web Readdy AI - AIでWebサイトを作成</title>
  <meta name="description" content="AIにプロンプトを伝えるだけで、簡単にWebサイトを作成できます" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --bg-primary: #F0F9FF;
      --bg-secondary: #E0F2FE;
      --text-primary: #334155;
      --text-secondary: #64748B;
      --accent: #7DD3FC;
      --success: #A7F3D0;
      --error: #FECACA;
    }
    .dark {
      --bg-primary: #0F172A;
      --bg-secondary: #1E293B;
      --text-primary: #E0F2FE;
      --text-secondary: #94A3B8;
      --accent: #38BDF8;
      --success: #34D399;
      --error: #F87171;
    }
    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      transition: all 0.3s ease;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
  </style>
</head>
<body>
  <div class="flex h-screen">
    <!-- サイドバー -->
    <aside class="w-72 bg-sky-50 dark:bg-slate-800 border-r border-sky-200 dark:border-slate-700 p-6 flex flex-col">
      <!-- ロゴ・タイトル -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-sky-600 dark:text-sky-400">Web Readdy AI</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">AIでWebサイトを作成</p>
      </div>

      <!-- AIプロバイダー選択 -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">AIプロバイダー</label>
        <div class="space-y-2">
          <label class="flex items-center p-3 rounded-lg border border-sky-200 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 cursor-pointer transition-colors">
            <input type="radio" name="ai-provider" value="openai" checked class="w-4 h-4 text-sky-600" />
            <span class="ml-3 text-slate-700 dark:text-slate-300">OpenAI</span>
            <span class="ml-auto text-xs text-slate-400">GPT-4o</span>
          </label>
          <label class="flex items-center p-3 rounded-lg border border-sky-200 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 cursor-pointer transition-colors">
            <input type="radio" name="ai-provider" value="gemini" class="w-4 h-4 text-sky-600" />
            <span class="ml-3 text-slate-700 dark:text-slate-300">Google Gemini</span>
            <span class="ml-auto text-xs text-slate-400">2.0 Flash</span>
          </label>
          <label class="flex items-center p-3 rounded-lg border border-sky-200 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 cursor-pointer transition-colors">
            <input type="radio" name="ai-provider" value="claude" class="w-4 h-4 text-sky-600" />
            <span class="ml-3 text-slate-700 dark:text-slate-300">Anthropic</span>
            <span class="ml-auto text-xs text-slate-400">Claude Sonnet</span>
          </label>
        </div>
      </div>

      <!-- APIキー入力 -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">APIキー</label>
        <input type="password" id="api-key-input" placeholder="sk-..." class="w-full px-4 py-2 rounded-lg border border-sky-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500" />
        <p class="text-xs text-slate-400 mt-2">APIキーはブラウザにのみ保存されます</p>
      </div>

      <!-- スペーサー -->
      <div class="flex-1"></div>

      <!-- ダークモード切替 -->
      <button id="dark-mode-toggle" class="w-full p-3 rounded-lg border border-sky-200 dark:border-slate-600 hover:bg-sky-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 text-slate-700 dark:text-slate-300">
        🌙 ダークモード
      </button>

      <!-- バージョン -->
      <div class="mt-4 text-center text-xs text-slate-400">v1.0.0</div>
    </aside>

    <!-- メインコンテンツエリア -->
    <div class="flex-1 flex flex-col">
      <!-- メインエリア: プロンプト入力・ファイルアップロード -->
      <div class="flex-1 p-6 overflow-y-auto">
        <div class="max-w-3xl mx-auto">
          <!-- プロンプト入力エリア -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">作りたいWebサイトを説明してください</label>
            <textarea id="prompt-input" placeholder="例: ポートフォリオサイトを作って。青と白を基調にして、スキルセクションとお問い合わせフォームを入れて..." rows="6" class="w-full px-4 py-3 rounded-xl border-2 border-sky-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 resize-none"></textarea>
          </div>

          <!-- ファイルアップロードエリア -->
          <div id="drop-zone" class="mb-6 p-8 rounded-xl border-2 border-dashed border-sky-300 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 transition-colors bg-sky-50/50 dark:bg-slate-800/50 text-center cursor-pointer">
            <input type="file" accept="image/*,.pdf" multiple class="hidden" id="file-upload" />
            <label for="file-upload" class="cursor-pointer">
              <div class="text-4xl mb-3">📁</div>
              <p class="text-slate-700 dark:text-slate-300 font-medium">画像やPDFをドラッグ＆ドロップ</p>
              <p class="text-sm text-slate-400 mt-1">またはクリックしてファイルを選択</p>
            </label>
          </div>

          <!-- アップロードされたファイル一覧 -->
          <div id="uploaded-files-list" class="mb-6 hidden">
            <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">アップロードされたファイル</h3>
            <div id="uploaded-files-container" class="space-y-2"></div>
          </div>

          <!-- 生成ボタン -->
          <button id="generate-btn" onclick="handleGenerate()" class="w-full py-4 rounded-xl font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-lg shadow-sky-200 dark:shadow-sky-900 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed" disabled>
            <span class="flex items-center justify-center gap-2">✨ Webサイトを生成</span>
          </button>

          <!-- ヒント -->
          <div class="mt-6 p-4 rounded-lg bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700">
            <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">💡 ヒント</h4>
            <ul class="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <li>• 具体的な色やレイアウトを指定すると、より理想的なサイトが作れます</li>
              <li>• 参考にしたい画像をアップロードすると、その雰囲気を再現できます</li>
              <li>• 「ヘッダー」「メインセクション」「フッター」など、構造を指定するのもおすすめ</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- プレビューエリア -->
      <div id="preview-area" class="h-64 bg-slate-100 dark:bg-slate-900 border-t border-sky-200 dark:border-slate-700 flex items-center justify-center">
        <div class="text-center text-slate-400">
          <div class="text-4xl mb-3">🎨</div>
          <p>プロンプトを入力して「Webサイトを生成」をクリックしてください</p>
        </div>
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
  aiProvider: 'openai',
  apiKey: localStorage.getItem('apiKey') || '',
  prompt: '',
  uploadedFiles: [],
  generatedCode: null,
  isGenerating: false,
  darkMode: localStorage.getItem('darkMode') === 'true'
}

// ダークモード適用
if (state.darkMode) {
  document.documentElement.classList.add('dark')
  updateDarkModeButton()
}

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners()
  updateUI()
})

function initEventListeners() {
  document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => { state.aiProvider = e.target.value })
  })

  const apiKeyInput = document.getElementById('api-key-input')
  if (apiKeyInput) {
    apiKeyInput.value = state.apiKey
    apiKeyInput.addEventListener('input', (e) => {
      state.apiKey = e.target.value
      localStorage.setItem('apiKey', e.target.value)
    })
  }

  const textarea = document.getElementById('prompt-input')
  if (textarea) {
    textarea.addEventListener('input', (e) => {
      state.prompt = e.target.value
      updateGenerateButton()
    })
  }

  const fileInput = document.getElementById('file-upload')
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload)
  }

  const dropZone = document.getElementById('drop-zone')
  if (dropZone) {
    dropZone.addEventListener('drop', handleDrop)
    dropZone.addEventListener('dragover', (e) => { e.preventDefault() })
  }

  const darkModeBtn = document.getElementById('dark-mode-toggle')
  if (darkModeBtn) {
    darkModeBtn.addEventListener('click', toggleDarkMode)
  }
}

function handleFileUpload(e) {
  const files = Array.from(e.target.files || [])
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
  const validFiles = files.filter(f => allowedTypes.includes(f.type))
  state.uploadedFiles = [...state.uploadedFiles, ...validFiles]
  updateUploadedFilesList()
}

function handleDrop(e) {
  e.preventDefault()
  const files = Array.from(e.dataTransfer?.files || [])
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
  const validFiles = files.filter(f => allowedTypes.includes(f.type))
  state.uploadedFiles = [...state.uploadedFiles, ...validFiles]
  updateUploadedFilesList()
}

function updateUploadedFilesList() {
  const listContainer = document.getElementById('uploaded-files-list')
  const filesContainer = document.getElementById('uploaded-files-container')
  if (!listContainer || !filesContainer) return

  if (state.uploadedFiles.length === 0) {
    listContainer.classList.add('hidden')
    return
  }

  listContainer.classList.remove('hidden')
  filesContainer.innerHTML = state.uploadedFiles.map((file, index) => \`
    <div class="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-700 border border-sky-200 dark:border-slate-600">
      <div class="flex items-center gap-3">
        <span class="text-2xl">\${file.type.startsWith('image/') ? '🖼️' : '📄'}</span>
        <div>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">\${file.name}</p>
          <p class="text-xs text-slate-400">\${(file.size / 1024).toFixed(1)} KB</p>
        </div>
      </div>
      <button onclick="removeFile(\${index})" class="text-red-500 hover:text-red-600 px-3 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">削除</button>
    </div>
  \`).join('')
}

window.removeFile = function(index) {
  state.uploadedFiles = state.uploadedFiles.filter((_, i) => i !== index)
  updateUploadedFilesList()
}

async function handleGenerate() {
  if (!state.prompt) {
    alert('プロンプトを入力してください')
    return
  }
  if (!state.apiKey) {
    alert('APIキーを入力してください')
    return
  }

  state.isGenerating = true
  updateGenerateButton()

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
        prompt: state.prompt,
        aiProvider: state.aiProvider,
        apiKey: state.apiKey,
        images: imageData
      })
    })

    const data = await response.json()

    if (data.success) {
      state.generatedCode = data.code
      updatePreviewArea()
    } else {
      alert('エラー: ' + data.error)
    }
  } catch (error) {
    console.error('Error:', error)
    alert('エラーが発生しました: ' + error.message)
  } finally {
    state.isGenerating = false
    updateGenerateButton()
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

function updateGenerateButton() {
  const btn = document.getElementById('generate-btn')
  if (btn) {
    btn.disabled = state.isGenerating || !state.prompt
    btn.innerHTML = state.isGenerating
      ? '<span class="flex items-center justify-center gap-2"><span class="animate-spin">⏳</span>生成中...</span>'
      : '<span class="flex items-center justify-center gap-2">✨ Webサイトを生成</span>'
  }
}

let currentViewMode = 'desktop'
let showCode = false

function updatePreviewArea() {
  const previewArea = document.getElementById('preview-area')
  if (!previewArea || !state.generatedCode) return

  previewArea.innerHTML = \`
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-sky-200 dark:border-slate-700">
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <button onclick="setViewMode('desktop')" id="view-desktop" class="view-mode-btn px-3 py-1 rounded text-sm transition-colors bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow">🖥️ デスクトップ</button>
            <button onclick="setViewMode('tablet')" id="view-tablet" class="view-mode-btn px-3 py-1 rounded text-sm transition-colors text-slate-500 dark:text-slate-400">📱 タブレット</button>
            <button onclick="setViewMode('mobile')" id="view-mobile" class="view-mode-btn px-3 py-1 rounded text-sm transition-colors text-slate-500 dark:text-slate-400">📱 モバイル</button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="toggleCodeView()" id="code-toggle-btn" class="px-3 py-1 rounded text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors">💻 コード</button>
          <button onclick="downloadCode()" class="px-3 py-1 rounded text-sm bg-sky-500 hover:bg-sky-600 text-white transition-colors">📥 ダウンロード</button>
        </div>
      </div>
      <div class="flex-1 p-4 overflow-auto bg-slate-50 dark:bg-slate-900">
        <div class="flex justify-center items-center h-full">
          <iframe id="preview-iframe" srcdoc="" sandbox="allow-same-origin" class="bg-white rounded-lg shadow-lg w-full h-full"></iframe>
        </div>
      </div>
    </div>
  \`

  const iframe = document.getElementById('preview-iframe')
  if (iframe) {
    iframe.srcdoc = state.generatedCode
  }
}

window.setViewMode = function(mode) {
  currentViewMode = mode
  const iframe = document.getElementById('preview-iframe')
  if (!iframe) return

  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.className = 'view-mode-btn px-3 py-1 rounded text-sm transition-colors text-slate-500 dark:text-slate-400'
  })

  const activeBtn = document.getElementById('view-' + mode)
  if (activeBtn) {
    activeBtn.className = 'view-mode-btn px-3 py-1 rounded text-sm transition-colors bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow'
  }

  switch (mode) {
    case 'desktop':
      iframe.className = 'bg-white rounded-lg shadow-lg w-full h-full'
      break
    case 'tablet':
      iframe.className = 'bg-white rounded-lg shadow-lg w-[768px] h-[1024px]'
      break
    case 'mobile':
      iframe.className = 'bg-white rounded-lg shadow-lg w-[375px] h-[667px]'
      break
  }
}

window.toggleCodeView = function() {
  showCode = !showCode
  const btn = document.getElementById('code-toggle-btn')
  const previewArea = document.getElementById('preview-area')
  if (!btn || !previewArea || !state.generatedCode) return

  if (showCode) {
    btn.textContent = '🖼️ プレビュー'
    btn.className = 'px-3 py-1 rounded text-sm bg-sky-500 text-white transition-colors'
    previewArea.querySelector('.flex-1.p-4').innerHTML = \`<pre class="w-full h-full p-4 rounded-lg bg-slate-800 text-slate-100 text-sm overflow-auto"><code>\${escapeHtml(state.generatedCode)}</code></pre>\`
  } else {
    btn.textContent = '💻 コード'
    btn.className = 'px-3 py-1 rounded text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors'
    updatePreviewArea()
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

window.downloadCode = function() {
  if (!state.generatedCode) return
  const blob = new Blob([state.generatedCode], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'website.html'
  a.click()
  URL.revokeObjectURL(url)
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode
  localStorage.setItem('darkMode', String(state.darkMode))
  document.documentElement.classList.toggle('dark')
  updateDarkModeButton()
}

function updateDarkModeButton() {
  const btn = document.getElementById('dark-mode-toggle')
  if (btn) {
    btn.innerHTML = state.darkMode ? '☀️ ライトモード' : '🌙 ダークモード'
  }
}

function updateUI() {
  updateGenerateButton()
  updateDarkModeButton()
}

window.toggleDarkMode = toggleDarkMode
window.handleGenerate = handleGenerate
`
}

export default app
