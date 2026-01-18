import Foundation

/// WordPiece tokenizer for BERT-based models.
/// Implements the standard BERT tokenization algorithm.
class WordPieceTokenizer {
    
    private let vocab: [String: Int]
    private let unkToken = "[UNK]"
    private let clsToken = "[CLS]"
    private let sepToken = "[SEP]"
    private let padToken = "[PAD]"
    private let maxInputCharsPerWord = 200
    
    let unkTokenId: Int
    let clsTokenId: Int
    let sepTokenId: Int
    let padTokenId: Int
    let vocabSize: Int
    
    struct TokenizedResult {
        let inputIds: [Int]
        let attentionMask: [Int]
        let tokenToCharStart: [Int]
        let tokenToCharEnd: [Int]
        let tokenCount: Int
    }
    
    init(vocabFile: URL) throws {
        let content = try String(contentsOf: vocabFile, encoding: .utf8)
        var vocabMap: [String: Int] = [:]
        
        for (index, line) in content.components(separatedBy: .newlines).enumerated() {
            if !line.isEmpty {
                vocabMap[line] = index
            }
        }
        
        self.vocab = vocabMap
        self.vocabSize = vocabMap.count
        self.unkTokenId = vocabMap[unkToken] ?? 100
        self.clsTokenId = vocabMap[clsToken] ?? 101
        self.sepTokenId = vocabMap[sepToken] ?? 102
        self.padTokenId = vocabMap[padToken] ?? 0
    }
    
    /// Tokenize text and return token IDs with attention mask.
    func tokenize(text: String, maxLength: Int, addSpecialTokens: Bool = true) -> TokenizedResult {
        var inputIds = [Int](repeating: 0, count: maxLength)
        var attentionMask = [Int](repeating: 0, count: maxLength)
        var tokenToCharStart = [Int](repeating: -1, count: maxLength)
        var tokenToCharEnd = [Int](repeating: -1, count: maxLength)
        
        var tokenIdx = 0
        
        // Add [CLS] token
        if addSpecialTokens {
            inputIds[tokenIdx] = clsTokenId
            attentionMask[tokenIdx] = 1
            tokenIdx += 1
        }
        
        // Basic tokenization: split on whitespace and punctuation
        let basicTokens = basicTokenize(text: text)
        
        for (token, charStart, charEnd) in basicTokens {
            let maxTokens = maxLength - (addSpecialTokens ? 1 : 0)
            if tokenIdx >= maxTokens { break }
            
            // WordPiece tokenization
            let subTokens = wordPieceTokenize(token: token)
            
            for (subIdx, subToken) in subTokens.enumerated() {
                if tokenIdx >= maxTokens { break }
                
                let tokenId = vocab[subToken] ?? unkTokenId
                inputIds[tokenIdx] = tokenId
                attentionMask[tokenIdx] = 1
                
                // Map first subtoken to original char positions
                tokenToCharStart[tokenIdx] = charStart
                tokenToCharEnd[tokenIdx] = charEnd
                
                tokenIdx += 1
            }
        }
        
        // Add [SEP] token
        if addSpecialTokens && tokenIdx < maxLength {
            inputIds[tokenIdx] = sepTokenId
            attentionMask[tokenIdx] = 1
            tokenIdx += 1
        }
        
        return TokenizedResult(
            inputIds: inputIds,
            attentionMask: attentionMask,
            tokenToCharStart: tokenToCharStart,
            tokenToCharEnd: tokenToCharEnd,
            tokenCount: tokenIdx
        )
    }
    
    /// Basic tokenization: split on whitespace and punctuation, lowercase
    private func basicTokenize(text: String) -> [(String, Int, Int)] {
        var tokens: [(String, Int, Int)] = []
        var currentToken = ""
        var tokenStart = -1
        
        for (i, char) in text.enumerated() {
            if char.isWhitespace {
                if !currentToken.isEmpty {
                    tokens.append((currentToken.lowercased(), tokenStart, i))
                    currentToken = ""
                    tokenStart = -1
                }
            } else if isPunctuation(char) {
                if !currentToken.isEmpty {
                    tokens.append((currentToken.lowercased(), tokenStart, i))
                    currentToken = ""
                    tokenStart = -1
                }
                // Punctuation is its own token
                tokens.append((String(char), i, i + 1))
            } else {
                if tokenStart == -1 { tokenStart = i }
                currentToken.append(char)
            }
        }
        
        // Don't forget the last token
        if !currentToken.isEmpty {
            tokens.append((currentToken.lowercased(), tokenStart, text.count))
        }
        
        return tokens
    }
    
    /// WordPiece tokenization: break unknown words into subwords
    private func wordPieceTokenize(token: String) -> [String] {
        if token.count > maxInputCharsPerWord {
            return [unkToken]
        }
        
        // Check if whole token is in vocab
        if vocab[token] != nil {
            return [token]
        }
        
        var subTokens: [String] = []
        var start = 0
        let tokenArray = Array(token)
        
        while start < tokenArray.count {
            var end = tokenArray.count
            var foundSubToken: String? = nil
            
            while start < end {
                var subStr = String(tokenArray[start..<end])
                if start > 0 {
                    subStr = "##\(subStr)"
                }
                
                if vocab[subStr] != nil {
                    foundSubToken = subStr
                    break
                }
                end -= 1
            }
            
            if foundSubToken == nil {
                // Character not in vocab, use [UNK]
                subTokens.append(unkToken)
                start += 1
            } else {
                subTokens.append(foundSubToken!)
                start = end
            }
        }
        
        return subTokens
    }
    
    private func isPunctuation(_ char: Character) -> Bool {
        guard let scalar = char.unicodeScalars.first else { return false }
        let cp = Int(scalar.value)
        
        // ASCII punctuation
        if (33...47).contains(cp) || (58...64).contains(cp) ||
           (91...96).contains(cp) || (123...126).contains(cp) {
            return true
        }
        
        // Unicode punctuation categories
        return CharacterSet.punctuationCharacters.contains(scalar)
    }
}
