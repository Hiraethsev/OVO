// --- 向量记忆模块 (js/modules/vector_memory.js) ---

(function () {
    var lastErrorMessage = '';

    function setLastError(message) {
        lastErrorMessage = message || '';
    }

    function getEmbeddingSettings() {
        if (typeof db === 'undefined' || !db) return null;
        if (!db.embeddingSettings || typeof db.embeddingSettings !== 'object') return null;
        return db.embeddingSettings;
    }

    function getChatId(chat) {
        if (!chat || typeof chat !== 'object') return '';
        return chat.id || chat.chatId || '';
    }

    function inferSourceType(chat, options) {
        if (options && options.sourceType === 'group') return 'group';
        if (options && options.sourceType === 'private') return 'private';
        if (chat && Array.isArray(chat.members)) return 'group';
        return 'private';
    }

    function normalizeApiUrl(apiUrl) {
        var base = (apiUrl || '').trim();
        if (!base) return '';
        return base.replace(/\/+$/, '');
    }

    function buildEmbeddingEndpoint(apiUrl) {
        var base = normalizeApiUrl(apiUrl);
        if (!base) return '';
        if (/\/embeddings$/i.test(base)) return base;
        if (/\/v\d+$/i.test(base)) return base + '/embeddings';
        return base + '/v1/embeddings';
    }

    function normalizeText(text) {
        return typeof text === 'string' ? text.trim() : '';
    }

    function getMessageText(msg) {
        if (!msg) return '';
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
            return msg.parts.map(function (part) {
                if (!part) return '';
                if (typeof part.text === 'string') return part.text;
                if (part.type === 'image') return '[图片]';
                if (part.type === 'audio') return '[语音]';
                if (part.type === 'video') return '[视频]';
                if (part.type === 'file') return '[文件]';
                return '';
            }).join('').trim();
        }
        if (typeof msg.content === 'string') return msg.content.trim();
        return '';
    }

    function getMessageSpeaker(msg, sourceType) {
        if (!msg) return sourceType === 'group' ? '成员' : '对话';
        if (msg.role === 'user') return '我';
        if (msg.role === 'assistant') return sourceType === 'group' ? '成员' : 'TA';
        if (msg.role === 'system') return '系统';
        return msg.role || (sourceType === 'group' ? '成员' : '对话');
    }

    function shouldIncludeMessage(msg) {
        if (!msg) return false;
        if (msg.isAiIgnore) return false;
        if (msg.isContextDisabled) return false;
        if (msg.isThinking) return false;
        var content = getMessageText(msg);
        if (!content) return false;
        if (content.trim().indexOf('<thinking>') === 0) return false;
        return true;
    }

    function getHistoryList(chat) {
        if (!chat || !Array.isArray(chat.history)) return [];
        return chat.history.filter(shouldIncludeMessage);
    }

    function buildChunkId(chatId, sourceType, startIndex, endIndex) {
        return ['memory_chunk', sourceType, chatId, startIndex, endIndex].join('_');
    }

    function ensureMemoryChunksArray() {
        if (typeof db === 'undefined' || !db) return [];
        if (!Array.isArray(db.memoryChunks)) db.memoryChunks = [];
        return db.memoryChunks;
    }

    function getChatChunks(chatId, sourceType) {
        return ensureMemoryChunksArray().filter(function (chunk) {
            return chunk && chunk.chatId === chatId && chunk.sourceType === sourceType;
        });
    }

    function dedupeByChunkId(chunks) {
        var map = new Map();
        (chunks || []).forEach(function (chunk) {
            if (!chunk || !chunk.id) return;
            map.set(chunk.id, chunk);
        });
        return Array.from(map.values());
    }

    async function persistMemoryChunks(nextChunks) {
        ensureMemoryChunksArray();
        db.memoryChunks = dedupeByChunkId(nextChunks);
        if (typeof saveData === 'function') {
            await saveData();
        }
    }

    async function embedText(text, options) {
        try {
            setLastError('');
            var content = normalizeText(text);
            if (!content) return [];

            var settings = getEmbeddingSettings();
            if (!settings) {
                setLastError('embeddingSettings not found');
                console.warn('[VectorMemory] embeddingSettings not found.');
                return [];
            }

            var apiUrl = normalizeApiUrl((options && options.apiUrl) || settings.apiUrl);
            var apiKey = (options && options.apiKey) || settings.apiKey || '';
            var model = (options && options.model) || settings.model || '';

            if (!apiUrl || !apiKey || !model) {
                setLastError('embedding API config is incomplete');
                console.warn('[VectorMemory] embedding API config is incomplete.');
                return [];
            }

            var endpoint = buildEmbeddingEndpoint(apiUrl);
            var response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                },
                body: JSON.stringify({
                    model: model,
                    input: content
                })
            });

            if (!response.ok) {
                var errorText = 'HTTP ' + response.status;
                try {
                    var errorJson = await response.json();
                    errorText = (errorJson && errorJson.error && errorJson.error.message) || errorText;
                } catch (e) {}
                setLastError(errorText);
                console.warn('[VectorMemory] embedText failed:', errorText);
                return [];
            }

            var result = await response.json();
            var embedding = result && result.data && result.data[0] && result.data[0].embedding;
            if (!Array.isArray(embedding)) {
                setLastError('invalid embedding response');
                console.warn('[VectorMemory] invalid embedding response.');
                return [];
            }
            return embedding;
        } catch (error) {
            setLastError(error && error.message ? error.message : 'unknown embedding error');
            console.warn('[VectorMemory] embedText error:', error);
            return [];
        }
    }

    function cosineSimilarity(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
        if (a.length !== b.length) {
            console.warn('[VectorMemory] embedding dimension mismatch:', a.length, b.length);
            return 0;
        }

        var dot = 0;
        var normA = 0;
        var normB = 0;
        for (var i = 0; i < a.length; i++) {
            var av = Number(a[i]) || 0;
            var bv = Number(b[i]) || 0;
            dot += av * bv;
            normA += av * av;
            normB += bv * bv;
        }

        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    function buildChunksFromHistory(chat, options) {
        var chatId = getChatId(chat);
        if (!chatId) return [];

        var sourceType = inferSourceType(chat, options);
        var history = getHistoryList(chat);
        var chunkSize = parseInt(options && options.chunkSize, 10);
        if (isNaN(chunkSize) || chunkSize <= 0) chunkSize = 6;

        var chunks = [];
        for (var i = 0; i < history.length; i += chunkSize) {
            var slice = history.slice(i, i + chunkSize);
            var text = slice.map(function (msg) {
                return getMessageSpeaker(msg, sourceType) + ': ' + getMessageText(msg);
            }).join('\n').trim();

            if (!text) continue;

            chunks.push({
                id: buildChunkId(chatId, sourceType, i, i + slice.length - 1),
                chatId: chatId,
                sourceType: sourceType,
                startIndex: i,
                endIndex: i + slice.length - 1,
                text: text,
                embedding: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                hitCount: 0,
                lastHitAt: 0
            });
        }

        return chunks;
    }

    async function vectorizeNextBatch(chat, options) {
        try {
            setLastError('');
            var chatId = getChatId(chat);
            if (!chatId) {
                return { success: false, processed: 0, created: 0, reason: 'missing_chat_id' };
            }

            var settings = getEmbeddingSettings();
            if (!settings || !settings.apiKey || !settings.apiUrl || !settings.model) {
                return { success: false, processed: 0, created: 0, reason: 'missing_embedding_config' };
            }

            var sourceType = inferSourceType(chat, options);
            var batchSize = parseInt(options && options.batchSize, 10);
            if (isNaN(batchSize) || batchSize <= 0) batchSize = parseInt(settings.batchSize, 10) || 10;

            var builtChunks = buildChunksFromHistory(chat, options);
            var existingChunks = getChatChunks(chatId, sourceType);
            var existingIds = new Set(existingChunks.map(function (chunk) { return chunk.id; }));
            var pendingChunks = builtChunks.filter(function (chunk) {
                return !existingIds.has(chunk.id);
            }).slice(0, batchSize);

            if (pendingChunks.length === 0) {
                return { success: true, processed: 0, created: 0, reason: 'no_pending_chunks' };
            }

            var createdChunks = [];
            var firstError = '';
            for (var i = 0; i < pendingChunks.length; i++) {
                var chunk = pendingChunks[i];
                var embedding = await embedText(chunk.text, options);
                if (!Array.isArray(embedding) || embedding.length === 0) {
                    if (!firstError && lastErrorMessage) firstError = lastErrorMessage;
                    console.warn('[VectorMemory] skip chunk embedding failure:', chunk.id);
                    continue;
                }

                chunk.embedding = embedding;
                chunk.updatedAt = Date.now();
                createdChunks.push(chunk);
            }

            if (createdChunks.length === 0 && firstError) {
                return {
                    success: false,
                    processed: pendingChunks.length,
                    created: 0,
                    reason: 'embedding_request_failed',
                    message: firstError
                };
            }

            if (createdChunks.length > 0) {
                await persistMemoryChunks(existingChunks.concat(createdChunks).concat(
                    ensureMemoryChunksArray().filter(function (chunk) {
                        return !(chunk.chatId === chatId && chunk.sourceType === sourceType);
                    })
                ));
            }

            return {
                success: true,
                processed: pendingChunks.length,
                created: createdChunks.length,
                chunks: createdChunks
            };
        } catch (error) {
            console.warn('[VectorMemory] vectorizeNextBatch error:', error);
            return { success: false, processed: 0, created: 0, reason: 'exception', error: error };
        }
    }

    function buildQueryText(history, options) {
        var sourceType = inferSourceType(null, options);
        var queryTurns = parseInt(options && options.queryTurns, 10);
        if (isNaN(queryTurns) || queryTurns <= 0) queryTurns = 4;

        var filtered = (Array.isArray(history) ? history : []).filter(shouldIncludeMessage);
        if (filtered.length === 0) return '';

        var slice = filtered.slice(-queryTurns);
        return slice.map(function (msg) {
            return getMessageSpeaker(msg, sourceType) + ': ' + getMessageText(msg);
        }).join('\n').trim();
    }

    async function buildRetrievedMemoryContext(history, chat, options) {
        try {
            var chatId = getChatId(chat);
            if (!chatId) return '';

            var settings = getEmbeddingSettings();
            if (!settings || settings.enabled === false) return '';

            var sourceType = inferSourceType(chat, options);
            var topK = parseInt(options && options.topK, 10);
            if (isNaN(topK) || topK <= 0) topK = parseInt(settings.defaultTopK, 10) || 3;

            var minSimilarity = Number(options && options.minSimilarity);
            if (isNaN(minSimilarity)) minSimilarity = Number(settings.defaultMinSimilarity);
            if (isNaN(minSimilarity)) minSimilarity = 0.3;

            var queryText = buildQueryText(history, { sourceType: sourceType, queryTurns: options && options.queryTurns });
            if (!queryText) return '';

            var queryEmbedding = await embedText(queryText, options);
            if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return '';

            var chunks = getChatChunks(chatId, sourceType).filter(function (chunk) {
                return chunk && Array.isArray(chunk.embedding) && chunk.embedding.length > 0 && chunk.text;
            });
            if (chunks.length === 0) return '';

            var scored = chunks.map(function (chunk) {
                return {
                    chunk: chunk,
                    score: cosineSimilarity(queryEmbedding, chunk.embedding)
                };
            }).filter(function (item) {
                return item.score >= minSimilarity;
            }).sort(function (a, b) {
                return b.score - a.score;
            }).slice(0, topK);

            if (scored.length === 0) return '';

            var now = Date.now();
            var changed = false;
            scored.forEach(function (item) {
                item.chunk.hitCount = (item.chunk.hitCount || 0) + 1;
                item.chunk.lastHitAt = now;
                item.chunk.updatedAt = now;
                changed = true;
            });

            if (changed) {
                var allChunks = ensureMemoryChunksArray();
                var scoredIds = new Set(scored.map(function (item) { return item.chunk.id; }));
                var nextChunks = allChunks.map(function (chunk) {
                    if (!scoredIds.has(chunk.id)) return chunk;
                    var updated = scored.find(function (item) { return item.chunk.id === chunk.id; });
                    return updated ? updated.chunk : chunk;
                });
                await persistMemoryChunks(nextChunks);
            }

            return scored.map(function (item, index) {
                return '【相关记忆片段 ' + (index + 1) + '｜相似度 ' + item.score.toFixed(3) + '】\n' + item.chunk.text;
            }).join('\n\n');
        } catch (error) {
            console.warn('[VectorMemory] buildRetrievedMemoryContext error:', error);
            return '';
        }
    }

    function getVectorMemoryStats(chatId) {
        var allChunks = ensureMemoryChunksArray();
        var filtered = allChunks.filter(function (chunk) {
            return chunk && chunk.chatId === chatId;
        });
        var vectorizedCount = filtered.filter(function (chunk) {
            return Array.isArray(chunk.embedding) && chunk.embedding.length > 0;
        }).length;

        return {
            chatId: chatId,
            totalChunks: filtered.length,
            vectorizedChunks: vectorizedCount,
            pendingChunks: Math.max(0, filtered.length - vectorizedCount)
        };
    }

    window.VectorMemory = {
        embedText: embedText,
        cosineSimilarity: cosineSimilarity,
        buildChunksFromHistory: buildChunksFromHistory,
        vectorizeNextBatch: vectorizeNextBatch,
        buildRetrievedMemoryContext: buildRetrievedMemoryContext,
        getVectorMemoryStats: getVectorMemoryStats
    };
})();
