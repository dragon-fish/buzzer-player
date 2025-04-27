/*
  BZS (Buzzer Script) parser built with Chevrotain.
  Produces an AST compatible with the structure we used in PEG.js:

    {
      globals: { tempo?: number, waveform?: string, volume?: number },
      tracks: [
        {
          name: string,
          delay: number,
          waveform?: string | null,
          volume?: number | null,
          tokens: TokenNode[]   // flattened melody tokens
        }
      ]
    }

  A TokenNode is { type:'note', note:'C', accidental:'#'|'b'|null, octave:number|null, duration:number }
*/

import { createToken, Lexer, CstParser, IToken } from 'chevrotain'

/*──────────────────────────────────────────────────────────*/
/*  Token Definitions                                      */
/*──────────────────────────────────────────────────────────*/

const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
})
const NewLine = createToken({ name: 'NewLine', pattern: /\r?\n/ })
const Comment = createToken({
  name: 'Comment',
  pattern: /#.*/,
  group: Lexer.SKIPPED,
})

const AtTrack = createToken({ name: 'AtTrack', pattern: /@track/ })
const Equal = createToken({ name: 'Equal', pattern: /=/ })
const BarLine = createToken({ name: 'BarLine', pattern: /\|+/ })

const NumberTok = createToken({
  name: 'NumberTok',
  pattern: /[0-9]+(?:\.[0-9]+)?/,
})
const Identifier = createToken({
  name: 'Identifier',
  pattern: /[A-Za-z_][A-Za-z0-9_-]*/,
})

// Note token captures things like C4, C#4, Db3, R, etc.
const NoteTok = createToken({
  name: 'NoteTok',
  pattern: /(?:R|[A-G](?:#|b)?[0-9]?)/,
})

const AllTokens = [
  WhiteSpace,
  Comment,
  NewLine,
  AtTrack,
  Equal,
  BarLine,
  NumberTok,
  NoteTok,
  Identifier,
]

const BZSLexer = new Lexer(AllTokens)

/*──────────────────────────────────────────────────────────*/
/*  Parser                                                 */
/*──────────────────────────────────────────────────────────*/

type TokenNode = {
  type: 'note'
  note: string
  accidental: '#' | 'b' | null
  octave: number | null
  duration: number
  isRest: boolean
}

type TrackNode = {
  name: string
  delay: number
  waveform: string | null
  volume: number | null
  tempo: number | null
  tokens: TokenNode[]
}

type Ast = {
  globals: { tempo?: number; waveform?: string; volume?: number }
  tracks: TrackNode[]
}

class BzsCstParser extends CstParser {
  constructor() {
    super(AllTokens, { recoveryEnabled: true })
    const $ = this as unknown as any

    $.RULE('program', () => {
      $.MANY(() => $.SUBRULE($.directive))
      $.AT_LEAST_ONE(() => $.SUBRULE($.trackBlock))
    })

    /*──────────── Directives ────────────*/
    $.RULE('directive', () => {
      $.CONSUME(Identifier)
      $.CONSUME1(WhiteSpace, { OPT: true })
      $.CONSUME(Equal)
      $.CONSUME2(WhiteSpace, { OPT: true })
      $.CONSUME(NumberTok)
      $.CONSUME(NewLine)
    })

    /*──────────── Track Block ───────────*/
    $.RULE('trackBlock', () => {
      $.OPTION(() => {
        $.CONSUME(AtTrack)
        $.CONSUME(WhiteSpace)
        $.CONSUME(Identifier)
        $.MANY(() => $.SUBRULE($.trackOption))
        $.CONSUME(NewLine)
      })
      $.AT_LEAST_ONE(() => $.SUBRULE($.noteLine))
    })

    $.RULE('trackOption', () => {
      $.CONSUME(WhiteSpace)
      $.CONSUME(Identifier)
      $.CONSUME(Equal)
      $.CONSUME(NumberTok)
    })

    $.RULE('noteLine', () => {
      $.AT_LEAST_ONE_SEP({
        SEP: WhiteSpace,
        DEF: () => $.SUBRULE($.noteOrRest),
      })
      $.OPTION(() => $.CONSUME(BarLine))
      $.CONSUME(NewLine)
    })

    $.RULE('noteOrRest', () => {
      $.CONSUME(NoteTok)
      $.CONSUME(WhiteSpace)
      $.CONSUME(NumberTok)
    })

    this.performSelfAnalysis()
  }
}

/*──────────────────────────────────────────────────────────*/
/*  Wrapper API                                            */
/*──────────────────────────────────────────────────────────*/

export class BzsParser {
  private cstParser = new BzsCstParser()

  parse(text: string): Ast {
    // 1) Lexing
    const lexResult = BZSLexer.tokenize(text)
    if (lexResult.errors.length) throw lexResult.errors[0]

    // 2) Parsing (to CST)
    this.cstParser.input = lexResult.tokens
    if (this.cstParser.errors.length) throw this.cstParser.errors[0]

    // 3) CST → AST (very lightweight; walk tokens inline)
    return this.cstToAst(lexResult.tokens)
  }

  private cstToAst(tokens: IToken[]): Ast {
    const globals: Record<string, any> = {}
    const tracks: TrackNode[] = []

    let currentTrack: TrackNode = {
      name: 'main',
      delay: 0,
      waveform: null,
      volume: null,
      tempo: null,
      tokens: [],
    }
    let expectingDur = false
    let pendingNote: TokenNode | null = null

    const pushTrack = () => {
      if (currentTrack.tokens.length) tracks.push(currentTrack)
    }

    const numVal = (tok: IToken) => parseFloat(tok.image)

    // Simple single-pass walk
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      switch (t.tokenType) {
        case Identifier:
          if (tokens[i + 1]?.tokenType === Equal) {
            // directive or option – handled when hitting '='
            continue
          }
          break
        case Equal:
          const keyTok = tokens[i - 1]
          const valTok = tokens[i + 1]
          if (!keyTok || !valTok) continue
          if (!currentTrack.tokens.length && keyTok.tokenType === Identifier) {
            // global directive (appears before any notes)
            const maybeNum = numVal(valTok)
            const key = keyTok.image.toLowerCase()
            const val = isNaN(maybeNum) ? String(valTok.image) : maybeNum
            globals[key] = val
          } else if (currentTrack && keyTok.tokenType === Identifier) {
            // track option (after @track)
            const key = keyTok.image.toLowerCase()
            if (key === 'delay') currentTrack.delay = numVal(valTok)
            if (key === 'waveform') currentTrack.waveform = String(valTok.image)
            if (key === 'volume') currentTrack.volume = numVal(valTok)
            if (key === 'tempo') currentTrack.tempo = numVal(valTok)
          }
          break
        case AtTrack:
          pushTrack()
          i += 1 // skip @track

          // skip whitespace
          while (i < tokens.length && tokens[i].tokenType === WhiteSpace) {
            i++
          }

          if (i < tokens.length && tokens[i].tokenType === Identifier) {
            const trackName = tokens[i].image

            // Create a new track
            currentTrack = {
              name: trackName,
              delay: 0,
              waveform: null,
              volume: null,
              tempo: null,
              tokens: [],
            }

            i++

            while (i < tokens.length && tokens[i].tokenType !== NewLine) {
              if (tokens[i].tokenType === WhiteSpace) {
                i++
                continue
              }

              // key=value
              if (
                i + 2 < tokens.length &&
                tokens[i].tokenType === Identifier &&
                tokens[i + 1].tokenType === Equal
              ) {
                const paramKey = tokens[i].image.toLowerCase()
                const valTok = tokens[i + 2]

                if (valTok) {
                  switch (paramKey) {
                    case 'delay':
                      const delayVal = numVal(valTok)
                      currentTrack.delay = delayVal
                      break
                    case 'waveform':
                      currentTrack.waveform = String(valTok.image)
                      break
                    case 'volume':
                      const volVal = numVal(valTok)
                      currentTrack.volume = volVal
                      break
                    case 'tempo':
                      const tempoVal = numVal(valTok)
                      currentTrack.tempo = tempoVal
                      break
                  }

                  // skip processed tokens
                  i += 3
                } else {
                  i += 2
                }
              } else {
                i++
              }
            }

            // No need to i--, as we want the main loop to increment it again to skip the newline
          } else {
            // If no track name is found, we create a default track
            // This is a fallback in case the @track directive is not followed by a valid identifier
            currentTrack = {
              name: `unnamed_${tracks.length}`,
              delay: 0,
              waveform: null,
              volume: null,
              tempo: null,
              tokens: [],
            }
          }
          break
        case NoteTok:
          // create stub; duration to fill on next NumberTok
          const m = t.image.match(/^(R|[A-G])(#|b)?([0-9])?$/)!
          const isRest = m[1] === 'R'
          pendingNote = {
            type: 'note',
            note: m[1],
            accidental: (m[2] as any) || null,
            octave: m[3] ? parseInt(m[3]) : null,
            duration: 0,
            isRest: isRest,
          }
          expectingDur = true
          break
        case NumberTok:
          if (expectingDur && pendingNote) {
            pendingNote.duration = parseFloat(t.image)
            currentTrack.tokens.push(pendingNote)
            expectingDur = false
            pendingNote = null
          }
          break
        case NewLine:
        case BarLine:
        default:
      }
    }
    pushTrack()
    return { globals, tracks }
  }
}
