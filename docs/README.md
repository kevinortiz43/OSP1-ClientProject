# Client Project: Experimental AI Chat Application with Local Model Integration

<div align="left">
  <i>React · Vite · Docker · Bun · Elysia · pgAdmin · Ollama · Postgres</i>
</div>

## Required Disclaimer

This prototype was built as part of a client-student partnership through Codesmith's Future Code program. It explores solutions to a real-world case study provided by an external partner. # This work does not represent employment or contracting with the partner. All intellectual property belongs to the partner. This is a time-boxed MVP and not a production system.

## Table of Contents
- [Overview](#overview)
- [Why This Exists](#why-this-exists)
- [Architecture Summary](#architecture-summary)
- [Documentation](#documentation)

## Overview

This is the offline local AI branch of OSP1-ClientProject. The goal was building a responsive AI chatbot using only free, open-source models running locally. Free models aren't as powerful as paid ones. Many of them on HuggingFace have no inference providers available so can only be run if downloaded directly. The question was: how useful could they be?

### Model Architecture

The offline AI setup uses 2 models:

- **Model 1**: Text-to-SQL model for query translation
- **Model 2**: Dual-purpose model
  - Generates human-friendly responses from returned results
  - Evaluates result quality

### Performance Optimization

This setup includes a preloading script for seamless model switching. Both models warm up when the application starts. If they load during a user request, the delay could be 83% to 430% longer.

## Why This Exists

- **Local inference**: No external API dependencies
- **Open source model comparison**: Evaluate performance of freely available models
- **GPU acceleration**: Optional GPU support (see docker-compose.yml)
- **Model preloading**: Optional script to pre-load both models
- **Hot-swappable models**: Switch models at runtime without restart
- **Infrastructure demonstration**: Complex orchestration patterns

## Architecture Summary

### High-Level Patterns

- **Cache-aside pattern**: Optimize for frequent queries
- **Query routing**: Keyword text search vs AI path
- **Text-to-SQL model**: Natural language to database queries
- **Response generation model**: SQL results to human-readable text
- **LLM-as-Judge**: Automated quality evaluation
- **Non-blocking evaluation**: Async result scoring
- **Dynamic database seeding**: Automated ETL pipeline

### AI Implementation

Refer to AI flow chart in [AI Architecture Deep Dive](ai-architecture.md) for a visual representation of the request flow from user prompt to response generation, including the non-blocking evaluation step.

The flow implements a cache-aside pattern:
1. **Cache check**: Prioritize cached responses
2. **Keyword search**: Simple text matching (also cache-first)
3. **AI path**: Complex query handling via model inference

**Disclaimer**: This AI flow merely mimics a more robust pipeline. Developed in under two weeks, it's not production-ready but merely demonstrates architectural patterns.    

### Dynamic Database Seeding

The PostgreSQL database can be dynamically seeded from raw Relay-like JSON files. Run `bun run setup` to execute the OS-agnostic ETL pipeline:

1. **Extract**: Parse ALL JSON files from `src/server/data/`
2. **Transform**: Convert JSON to CSV format
3. **Load**: Import data into PostgreSQL
4. **Generate**: Create TypeScript schemas from database types

**Requirements**: Input JSON must be relatively flat and follow consistent structure.

## Documentation

- [Setup Guide](setup.md) - Comprehensive setup guide
- [AI Architecture Deep Dive](ai-architecture.md) -Detailed AI flow documentation
- [GPU + Model Notes](gpu-model-notes.md) - Model specifications and VRAM requirements