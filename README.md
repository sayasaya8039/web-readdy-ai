# Web Readdy AI

AI-powered website generator - Create websites by describing what you want in natural language.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Overview

Web Readdy AI is a web application that allows users to generate websites using AI. Simply describe the website you want, upload reference images or PDFs, and let AI create the code for you.

### Features

- **Multiple AI Providers**: Choose from OpenAI (GPT-4.1), Google Gemini (2.5 Flash), or Anthropic Claude (Opus 4.5)
- **Natural Language Input**: Describe your desired website in plain text
- **File Upload**: Upload images and PDFs as design references
- **Live Preview**: Preview generated code in desktop, tablet, and mobile modes
- **Code Editor**: View and edit the generated HTML/CSS/JS code
- **Dark Mode**: Built-in dark mode support
- **Responsive Design**: Works on all screen sizes

## Tech Stack

- **Framework**: Hono (Lightweight web framework)
- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Styling**: Tailwind CSS (via CDN)
- **Package Manager**: Bun

## Installation

### Prerequisites

- Node.js 18+ or Bun
- Cloudflare Workers account (for deployment)

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd web-readdy-ai
```

2. Install dependencies:
```bash
bun install
```

3. Start the development server:
```bash
bun run dev
```

4. Open your browser:
```
http://127.0.0.1:8787
```

## Usage

### Basic Usage

1. **Select AI Provider**: Choose your preferred AI provider (OpenAI, Gemini, or Claude)

2. **Enter API Key**: Input your API key for the selected provider
   - Your API key is stored locally in your browser
   - Get API keys from:
     - [OpenAI Platform](https://platform.openai.com/api-keys)
     - [Google AI Studio](https://aistudio.google.com/app/apikey)
     - [Anthropic Console](https://console.anthropic.com/settings/keys)

3. **Describe Your Website**: Enter a detailed prompt describing the website you want
   - Example: "Create a modern portfolio website for a photographer with a hero section, gallery, and contact form"

4. **Upload Reference Files** (Optional): Add images or PDFs to guide the design

5. **Generate**: Click the "Generate" button and wait for the AI to create your website

6. **Preview & Edit**:
   - Switch between desktop, tablet, and mobile preview modes
   - Toggle code view to see and edit the generated HTML
   - Download the generated code

### Supported AI Models

| Provider | Model | Description |
|----------|-------|-------------|
| OpenAI | GPT-4.1 | Latest GPT-4 model (April 2025) |
| Google | Gemini 2.5 Flash | Fast and efficient (2025) |
| Anthropic | Claude Opus 4.5 | Most capable Claude model (November 2025) |

## Configuration

### Environment Variables

Edit `wrangler.toml` for environment-specific settings:

```toml
[vars]
ENVIRONMENT = "development"
```

### Cloudflare Deployment

1. Login to Cloudflare:
```bash
wrangler login
```

2. Deploy:
```bash
bun run deploy
```

## Project Structure

```
web-readdy-ai/
├── src/
│   └── index.ts          # Main application file
├── public/               # Static assets
├── wrangler.toml         # Cloudflare Workers config
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── README.md             # This file
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run deploy` | Deploy to Cloudflare Workers |
| `bun run build` | Build for production |
| `bun run typecheck` | Run TypeScript type check |
| `bun run lint` | Run ESLint |
| `bun run format` | Format code with Prettier |

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Inspired by [readdy.ai](https://readdy.ai)
- Built with [Hono](https://hono.dev)
- Powered by Cloudflare Workers
