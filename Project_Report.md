# Comprehensive Project Report: Foundation Model Translator System (Translator Buddy)

## 1. Executive Summary
The **Translator Buddy** project is a state-of-the-art, context-aware literary translation system, primarily focused on high-fidelity English-to-Urdu and Urdu-to-English translations. Leveraging modern Large Language Models (Google Gemini), the project transcends simple word-for-word translation by incorporating deep semantic context, tone instructions, and a self-improving "Human-in-the-Loop" (HITL) feedback mechanism.

The ecosystem comprises a web application for detailed translations and administrative oversight, a Chrome extension for on-the-fly context-aware web reading, and a robust, Dockerized telemetry stack for deep system observability and usage analytics.

## 2. System Architecture & Tech Stack
The architecture is designed to be modular, observable, and easily deployable, utilizing a microservices-inspired approach.

- **Backend API (FastAPI - Python):** Serves as the central nervous system. Handles LLM orchestration, user authentication, history tracking, and correction memory generation. It utilizes local JSON datastores (`users_store.json`, `history_store.json`, `feedback_store.json`) for lightweight, persistent data management.
- **Frontend Web Application (Next.js - React):** A modern, responsive interface built with React, styled with plain CSS/Tailwind, and heavily utilizing Recharts for data visualization. Deployed on **Vercel** for optimal edge performance and continuous delivery.
- **Chrome Extension (Manifest V3):** A companion tool injected directly into the user's browser, communicating with the FastAPI backend to provide seamless, in-context translations of highlighted web text.
- **Observability Stack (Docker Compose):** A comprehensive telemetry suite running locally/server-side, consisting of **Prometheus** (metrics), **Grafana** (visualization), **Loki** & **Promtail** (log aggregation), and **Node Exporter** (host metrics).

## 3. Core Engine: LLM & Fallback Mechanism
### Foundation Model Integration
The backend interfaces with the `google.generativeai` SDK. To ensure high availability and resilience, the translation engine implements a **Fallback Mechanism**. It sequentially attempts translations using a hierarchy of models:
1. `gemini-3.5-flash-lite` (Primary)
2. `gemini-2.5-flash-lite` (Secondary Fallback)
3. `gemini-3.1-flash-lite` (Tertiary Fallback)

If the primary model experiences rate limits or downtime, the system automatically degrades gracefully to the next available model, ensuring the user experience remains uninterrupted.

### Prompt Engineering & Tone Context
The system uses strict, highly specialized system prompts defining the model as a "master literary translator." It enforces rules such as preserving English acronyms in Urdu translations and ignoring literal phrasing in favor of idiomatic expressions. Users can also provide a "Context / Tone" input (e.g., "Gritty realism", "poetic"), which dynamically alters the prompt.

## 4. Human-in-the-Loop (HITL) & Feedback Loop
One of the most advanced features of the project is its dynamic learning capability through Human-in-the-Loop inline editing.

1. **Inline Editing & Flagging:** In the web application, the translated output is fully interactive. Users can click on any specific word in the translated text to flag it as inaccurate or awkward.
2. **User Corrections:** A popover UI appears, allowing the user to input the correct translation for that specific word or phrase.
3. **The Feedback Loop:** This correction is sent to the backend `/feedback` endpoint. 
4. **Correction Memory:** For all future translations by that specific user, the backend dynamically queries the feedback store, retrieves all past corrections, and constructs a `[CORRECTION MEMORY]` block. This block is injected into the LLM's system prompt (e.g., *Apply these corrections whenever you encounter similar words...*), actively guiding the LLM to learn from past mistakes and align with the user's personal vocabulary preferences.

## 5. Web Application Features
The Next.js frontend is divided into two primary roles:

### End-User Translator Interface
- **Authentication:** Secure login and registration.
- **Bidirectional Translation:** Toggle between `en-ur` and `ur-en`.
- **History Tracking:** A real-time ledger of past translations, including the original text, translation, token usage, and timestamp.
- **Review Panel:** A dedicated UI panel where users can view and manage their past feedback/corrections.

### Admin Analytics Dashboard
Administrative users have access to a rich, Grafana-inspired dashboard built entirely within the Next.js app using `recharts`.
- **Global Overview:** Visualizes total API calls, total tokens consumed, and active user counts across the entire system.
- **Time-Series Analytics:** Interactive area charts (1H, 6H, 24H, 7D, 30D views) tracking token consumption and request volume.
- **Per-User Drilldown:** Admins can select specific users to audit their individual translation history, monitor their API token footprint, and review the human corrections they've submitted to the system.

## 6. Chrome Extension
The project extends beyond the web app via a custom Manifest V3 Chrome Extension, designed for researchers and readers.
- **Context-Aware Extraction:** When a user highlights text and right-clicks "Translate with buddy", the extension doesn't just send the highlighted words. It injects a script into the active tab to extract the surrounding sentences (up to 300 characters before and after) and the page title. 
- **Disambiguation:** This surrounding text (~100-150 tokens) is sent to the backend as invisible "Context". This prevents the LLM from hallucinating translations for isolated words by understanding the semantic environment of the text.
- **Side Panel UI:** The translation result is gracefully rendered in the browser's native Side Panel, maintaining the user's reading flow without opening new tabs.

## 7. Telemetry & Observability (Grafana & Loki)
To ensure enterprise-grade monitoring, the project features a fully dockerized observability stack:
- **FastAPI Instrumentation:** The backend utilizes `prometheus_fastapi_instrumentator` to expose `/metrics`, tracking request latency, HTTP status codes, and endpoint usage.
- **Prometheus & Node Exporter:** Scrapes the FastAPI metrics and hardware-level server metrics (CPU, RAM, Disk).
- **Loki & Promtail:** Promtail continuously tails the `backend.log` and docker logs, shipping them to Loki. 
- **Grafana:** Acts as the single pane of glass, allowing administrators to correlate sudden spikes in API errors (via Prometheus) directly with backend application stack traces (via Loki) in real-time.

## 8. Deployment Strategy
- **Frontend:** The Next.js application is deployed on **Vercel**, benefiting from Vercel's global CDN, automatic SSL, and serverless edge functions for rapid content delivery.
- **Backend & Telemetry:** Designed to be hosted on a VPS or cloud instance (e.g., AWS EC2, DigitalOcean), running the FastAPI server alongside the Docker Compose telemetry stack, exposing the API for both the Vercel frontend and the Chrome extension.

---
*End of Report.*
