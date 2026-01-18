package com.localintelligence.core

import java.io.BufferedReader
import java.io.File
import java.io.FileReader

/**
 * WordPiece tokenizer for BERT-based models.
 * Implements the standard BERT tokenization algorithm.
 */
class WordPieceTokenizer(vocabFile: File) {
    
    private val vocab: Map<String, Int>
    private val unkToken = "[UNK]"
    private val clsToken = "[CLS]"
    private val sepToken = "[SEP]"
    private val padToken = "[PAD]"
    private val maxInputCharsPerWord = 200
    
    val unkTokenId: Int
    val clsTokenId: Int
    val sepTokenId: Int
    val padTokenId: Int
    val vocabSize: Int
    
    init {
        vocab = loadVocab(vocabFile)
        vocabSize = vocab.size
        unkTokenId = vocab[unkToken] ?: 100
        clsTokenId = vocab[clsToken] ?: 101
        sepTokenId = vocab[sepToken] ?: 102
        padTokenId = vocab[padToken] ?: 0
    }
    
    private fun loadVocab(file: File): Map<String, Int> {
        val vocabMap = mutableMapOf<String, Int>()
        BufferedReader(FileReader(file)).use { reader ->
            var index = 0
            reader.forEachLine { line ->
                vocabMap[line] = index
                index++
            }
        }
        return vocabMap
    }
    
    /**
     * Tokenize text and return token IDs with attention mask.
     * @param text Input text to tokenize
     * @param maxLength Maximum sequence length (will pad/truncate)
     * @param addSpecialTokens Whether to add [CLS] and [SEP] tokens
     * @return TokenizedResult with input_ids, attention_mask, and token-to-char mappings
     */
    fun tokenize(text: String, maxLength: Int, addSpecialTokens: Boolean = true): TokenizedResult {
        val inputIds = IntArray(maxLength)
        val attentionMask = IntArray(maxLength)
        val tokenToCharStart = IntArray(maxLength) { -1 }
        val tokenToCharEnd = IntArray(maxLength) { -1 }
        
        var tokenIdx = 0
        
        // Add [CLS] token
        if (addSpecialTokens) {
            inputIds[tokenIdx] = clsTokenId
            attentionMask[tokenIdx] = 1
            tokenIdx++
        }
        
        // Basic tokenization: split on whitespace and punctuation
        val basicTokens = basicTokenize(text)
        
        for ((token, charStart, charEnd) in basicTokens) {
            if (tokenIdx >= maxLength - (if (addSpecialTokens) 1 else 0)) break
            
            // WordPiece tokenization
            val subTokens = wordPieceTokenize(token)
            
            for ((subIdx, subToken) in subTokens.withIndex()) {
                if (tokenIdx >= maxLength - (if (addSpecialTokens) 1 else 0)) break
                
                val tokenId = vocab[subToken] ?: unkTokenId
                inputIds[tokenIdx] = tokenId
                attentionMask[tokenIdx] = 1
                
                // Map first subtoken to original char positions
                if (subIdx == 0) {
                    tokenToCharStart[tokenIdx] = charStart
                    tokenToCharEnd[tokenIdx] = charEnd
                } else {
                    // Continuation tokens share the same char range
                    tokenToCharStart[tokenIdx] = charStart
                    tokenToCharEnd[tokenIdx] = charEnd
                }
                
                tokenIdx++
            }
        }
        
        // Add [SEP] token
        if (addSpecialTokens && tokenIdx < maxLength) {
            inputIds[tokenIdx] = sepTokenId
            attentionMask[tokenIdx] = 1
            tokenIdx++
        }
        
        // Remaining positions are already 0 (padding)
        
        return TokenizedResult(
            inputIds = inputIds,
            attentionMask = attentionMask,
            tokenToCharStart = tokenToCharStart,
            tokenToCharEnd = tokenToCharEnd,
            tokenCount = tokenIdx
        )
    }
    
    /**
     * Basic tokenization: split on whitespace and punctuation, lowercase
     */
    private fun basicTokenize(text: String): List<Triple<String, Int, Int>> {
        val tokens = mutableListOf<Triple<String, Int, Int>>()
        val currentToken = StringBuilder()
        var tokenStart = -1
        
        for (i in text.indices) {
            val char = text[i]
            
            when {
                char.isWhitespace() -> {
                    if (currentToken.isNotEmpty()) {
                        tokens.add(Triple(currentToken.toString().lowercase(), tokenStart, i))
                        currentToken.clear()
                        tokenStart = -1
                    }
                }
                isPunctuation(char) -> {
                    if (currentToken.isNotEmpty()) {
                        tokens.add(Triple(currentToken.toString().lowercase(), tokenStart, i))
                        currentToken.clear()
                        tokenStart = -1
                    }
                    // Punctuation is its own token
                    tokens.add(Triple(char.toString(), i, i + 1))
                }
                else -> {
                    if (tokenStart == -1) tokenStart = i
                    currentToken.append(char)
                }
            }
        }
        
        // Don't forget the last token
        if (currentToken.isNotEmpty()) {
            tokens.add(Triple(currentToken.toString().lowercase(), tokenStart, text.length))
        }
        
        return tokens
    }
    
    /**
     * WordPiece tokenization: break unknown words into subwords
     */
    private fun wordPieceTokenize(token: String): List<String> {
        if (token.length > maxInputCharsPerWord) {
            return listOf(unkToken)
        }
        
        // Check if whole token is in vocab
        if (vocab.containsKey(token)) {
            return listOf(token)
        }
        
        val subTokens = mutableListOf<String>()
        var start = 0
        
        while (start < token.length) {
            var end = token.length
            var foundSubToken: String? = null
            
            while (start < end) {
                var subStr = token.substring(start, end)
                if (start > 0) {
                    subStr = "##$subStr"
                }
                
                if (vocab.containsKey(subStr)) {
                    foundSubToken = subStr
                    break
                }
                end--
            }
            
            if (foundSubToken == null) {
                // Character not in vocab, use [UNK]
                subTokens.add(unkToken)
                start++
            } else {
                subTokens.add(foundSubToken)
                start = end
            }
        }
        
        return subTokens
    }
    
    private fun isPunctuation(char: Char): Boolean {
        val cp = char.code
        // ASCII punctuation
        if ((cp in 33..47) || (cp in 58..64) || (cp in 91..96) || (cp in 123..126)) {
            return true
        }
        // Unicode punctuation category
        return Character.getType(char) == Character.OTHER_PUNCTUATION.toInt() ||
               Character.getType(char) == Character.DASH_PUNCTUATION.toInt() ||
               Character.getType(char) == Character.START_PUNCTUATION.toInt() ||
               Character.getType(char) == Character.END_PUNCTUATION.toInt() ||
               Character.getType(char) == Character.CONNECTOR_PUNCTUATION.toInt() ||
               Character.getType(char) == Character.INITIAL_QUOTE_PUNCTUATION.toInt() ||
               Character.getType(char) == Character.FINAL_QUOTE_PUNCTUATION.toInt()
    }
    
    data class TokenizedResult(
        val inputIds: IntArray,
        val attentionMask: IntArray,
        val tokenToCharStart: IntArray,
        val tokenToCharEnd: IntArray,
        val tokenCount: Int
    )
}
