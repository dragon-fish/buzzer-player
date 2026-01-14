grammar BZS

interface PatternEndNode {}
interface LoopStartNode { count: string }
interface LoopEndNode {}
interface BarLineNode {}
interface NewlineNode {}
interface CommandArgNode { kvKey?: string; kvValue?: string; value?: string }

entry Model:
  elements+=TopElement*;

TopElement:
    Newline
  | Directive
  | TrackHeader
  | PatternHeader
  | PatternEnd
  | LoopStart
  | LoopEnd
  | CallCommand
  | StateCommand
  | ChordEvent
  | RestEvent
  | NoteEvent
  | BarLine
;

Newline:
  {NewlineNode} NL;

// 全局指令：key=value（允许两侧空白）
Directive:
  key=ValidID '=' value=(TIME_SIGNATURE | NUMBER | ValidID);

// 轨道头：@track name [param=value ...]
TrackHeader:
  '@track' name=ValidID (params+=Param)*;

Param:
  key=ValidID '=' value=(TIME_SIGNATURE | NUMBER | ValidID);

// Pattern：@pattern name ... @end
PatternHeader:
  '@pattern' name=ValidID;

PatternEnd:
  {PatternEndNode} '@end';

// loop：:loop <count> ... :endloop
LoopStart:
  {LoopStartNode} ':loop' count=(NUMBER | 'inf');

LoopEnd:
  {LoopEndNode} ':endloop';

// call：:call <name>
CallCommand:
  ':call' name=ValidID;

// 通用状态命令：:cmd [arg...]
StateCommand:
  ':' name=ValidID (args+=CommandArg)*;

CommandArg:
  {CommandArgNode} (
      (kvKey=ValidID '=' kvValue=(TIME_SIGNATURE | NUMBER | ValidID))
    | (value=(TIME_SIGNATURE | NUMBER | ValidID))
  )
;

KeyValue:
  key=ValidID '=' value=(TIME_SIGNATURE | NUMBER | ValidID);

// 事件：note/rest/chord
NoteEvent:
  pitch=Pitch len=Len;

RestEvent:
  'R' len=Len;

ChordEvent:
  '[' pitches+=Pitch+ ']' len=Len;

Pitch:
  value=PITCH_LITERAL;

Len:
  denom=NUMBER dots=DOTS?;

BarLine:
  {BarLineNode} '|';

ValidID returns string:
    ID | 'R' | 'inf' | PITCH_LITERAL;

terminal PITCH_LITERAL: /[A-Ga-g](#|b)?[0-9]+/;
terminal DOTS: /\.\.?/;
terminal TIME_SIGNATURE: /[0-9]+\/[0-9]+/;
terminal NUMBER: /[+-]?[0-9]+(\.[0-9]+)?/;

// 标识符：字母/下划线开头
terminal ID: /[A-Za-z_][A-Za-z0-9_]*/;

terminal NL: /\r?\n/;
hidden terminal WS: /[ \t]+/;
hidden terminal COMMENT: /\/\/[^\n\r]*/;
