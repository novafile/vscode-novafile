// Generates the TextMate grammars in ../syntaxes from the definitions below.
//
// The grammars are written as JavaScript so that regular expressions can use
// String.raw instead of double-escaped JSON. Run `npm run build:grammars`
// after editing this file; the generated JSON is committed so that the
// extension needs no build step to load it.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const r = String.raw;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "syntaxes");

// ---------------------------------------------------------------------------
// Shared lexical pieces
// ---------------------------------------------------------------------------

const IDENT = r`[A-Za-z_][A-Za-z0-9_-]*`;
const QUOTED = r`"(?:[^"\\]|\\.)*"`;
// Characters that end a flow word (§4.7).
const DELIM = r`\s,\[\]{}()"`;
// Not preceded by a character that could be part of a flow word.
const WORD_START = r`(?<![^${DELIM}:=<>?!])`;
// Followed by the end of a flow word: a delimiter, `:` + delimiter, a comment, or EOL.
const WORD_END = r`(?=[${DELIM}]|:(?:[${DELIM}]|$)|$)`;
// Reserved first characters of plain scalars / flow words (§4.4).
const RESERVED = r`!"#$%&'*,:<=>?@\[\\\]^\x60{|}~()`;
const INT = r`-?(?:0|[1-9][0-9]*)`;
const NUM_FLOAT = r`${INT}(?:\.[0-9]+(?:[eE][+-]?[0-9]+)?|[eE][+-]?[0-9]+)`;
const NUM_RATIONAL = r`${INT}/[1-9][0-9]*`;
// End of an inline value: only a comment or whitespace may follow.
const VALUE_END = r`(?=\s*(?:\s#.*)?$)`;
const TYPED_LITERALS = "timestamp|duration|decimal|rational|bytes|float";
const NEVER = r`(?!)`;

const comment = {
  match: r`(?:(?<!\S)|(?<=[\]})"]))(#).*$`,
  name: "comment.line.number-sign.nova",
  captures: { 1: { name: "punctuation.definition.comment.nova" } },
};

const docSeparator = {
  match: r`^---\s*$`,
  name: "meta.separator.document.nova punctuation.separator.document.nova",
};

// ---------------------------------------------------------------------------
// Document grammar (source.nova). Rules come in two flavours: data documents
// and template documents (§9). They differ only in strings: `${...}` is an
// interpolation inside template strings but plain text in data strings.
// ---------------------------------------------------------------------------

function documentRules(tpl) {
  const s = tpl ? "-tpl" : "";
  const inc = (name) => ({ include: `#${name}${s}` });
  const rules = {};
  const add = (name, rule) => (rules[name + s] = rule);

  // -- strings --------------------------------------------------------------
  const escapes = [
    {
      match: r`\\(?:["\\/bfnrt$]|u[0-9A-Fa-f]{4}|u\{[0-9A-Fa-f]{1,6}\})`,
      name: "constant.character.escape.nova",
    },
    { match: r`\\.`, name: "invalid.illegal.escape.nova" },
  ];
  const interpolation = [
    { match: r`\$\$\{`, name: "constant.character.escape.dollar.nova" },
    {
      begin: r`\$\{`,
      end: r`\}`,
      beginCaptures: { 0: { name: "punctuation.section.interpolation.begin.nova" } },
      endCaptures: { 0: { name: "punctuation.section.interpolation.end.nova" } },
      name: "meta.embedded.interpolation.nova",
      contentName: "variable.other.interpolation.nova",
      patterns: [{ include: "#path" }],
    },
  ];
  add("string", {
    begin: '"',
    end: r`"|(?=$)`,
    beginCaptures: { 0: { name: "punctuation.definition.string.begin.nova" } },
    endCaptures: { 0: { name: "punctuation.definition.string.end.nova" } },
    name: "string.quoted.double.nova",
    patterns: [...escapes, ...(tpl ? interpolation : [])],
  });
  if (tpl) rules["interpolation"] = { patterns: interpolation };

  // -- flow values (§4.7, §4.8) --------------------------------------------
  add("flow-value", {
    patterns: [
      { include: "#comment" },
      inc("string"),
      inc("typed-literal"),
      inc("set"),
      inc("map"),
      inc("list"),
      inc("record"),
      inc("tuple"),
      { include: "#variant" },
      ...(tpl ? [{ include: "#spread" }, { include: "#reference" }] : []),
      { include: "#flow-scalar" },
    ],
  });
  add("typed-literal", {
    begin: r`(@)(${TYPED_LITERALS}|${IDENT})(\()`,
    end: r`\)`,
    beginCaptures: {
      0: { name: "meta.typed-literal.nova" },
      1: { name: "punctuation.definition.typed-literal.nova" },
      2: { name: "support.function.typed-literal.nova" },
      3: { name: "punctuation.section.arguments.begin.nova" },
    },
    endCaptures: { 0: { name: "punctuation.section.arguments.end.nova" } },
    contentName: "meta.typed-literal.arguments.nova",
    patterns: [inc("flow-value")],
  });
  add("set", {
    begin: r`(@)(set)(\[)`,
    end: r`\]`,
    beginCaptures: {
      1: { name: "punctuation.definition.typed-literal.nova" },
      2: { name: "support.type.set.nova" },
      3: { name: "punctuation.definition.set.begin.nova" },
    },
    endCaptures: { 0: { name: "punctuation.definition.set.end.nova" } },
    name: "meta.flow.set.nova",
    patterns: [{ include: "#comma" }, inc("flow-value")],
  });
  add("map", {
    begin: r`(@)(map)(\{)`,
    end: r`\}`,
    beginCaptures: {
      1: { name: "punctuation.definition.typed-literal.nova" },
      2: { name: "support.type.map.nova" },
      3: { name: "punctuation.definition.map.begin.nova" },
    },
    endCaptures: { 0: { name: "punctuation.definition.map.end.nova" } },
    name: "meta.flow.map.nova",
    patterns: [
      { match: "=>", name: "keyword.operator.map-arrow.nova" },
      { include: "#comma" },
      inc("flow-value"),
    ],
  });
  add("list", {
    begin: r`\[`,
    end: r`\]`,
    beginCaptures: { 0: { name: "punctuation.definition.list.begin.nova" } },
    endCaptures: { 0: { name: "punctuation.definition.list.end.nova" } },
    name: "meta.flow.list.nova",
    patterns: [{ include: "#comma" }, inc("flow-value")],
  });
  add("record", {
    begin: r`\{`,
    end: r`\}`,
    beginCaptures: { 0: { name: "punctuation.definition.record.begin.nova" } },
    endCaptures: { 0: { name: "punctuation.definition.record.end.nova" } },
    name: "meta.flow.record.nova",
    patterns: [
      { include: "#comma" },
      {
        match: r`(?<![^\s,{])(?:(${IDENT})|(${QUOTED}))\s*(:)(?=[${DELIM}]|$)`,
        captures: {
          1: { name: "entity.name.tag.nova" },
          2: { name: "entity.name.tag.nova string.quoted.double.nova" },
          3: { name: "punctuation.separator.key-value.nova" },
        },
      },
      inc("flow-value"),
    ],
  });
  add("tuple", {
    begin: r`\(`,
    end: r`\)`,
    beginCaptures: { 0: { name: "punctuation.definition.tuple.begin.nova" } },
    endCaptures: { 0: { name: "punctuation.definition.tuple.end.nova" } },
    name: "meta.flow.tuple.nova",
    patterns: [{ include: "#comma" }, inc("flow-value")],
  });

  // -- inline values after `key: ` / `- ` (§4.4) -----------------------------
  add("inline-value", {
    patterns: [
      { include: "#comment" },
      { include: "#inline-scalar" },
      inc("flow-value"),
    ],
  });

  // -- block strings (§4.6) -------------------------------------------------
  // The block ends at the first non-blank line that is not indented deeper
  // than the line holding `|` (indentation lookahead, as YAML grammars do).
  add("block-string", {
    begin: r`^( *)(?:(-)( +))?(?:(?:(${IDENT})|(${QUOTED}))(:)( +))?(\|-?)(?=\s*(?:#|$))`,
    end: r`^(?!\1 |\s*$)`,
    beginCaptures: {
      2: { name: "punctuation.definition.list.item.nova" },
      4: { name: "entity.name.tag.nova" },
      5: { name: "entity.name.tag.nova string.quoted.double.nova" },
      6: { name: "punctuation.separator.key-value.nova" },
      8: { name: "keyword.control.flow.block-scalar.nova" },
    },
    patterns: [
      {
        // One content line. The enclosing rule's end pattern (dedent) is
        // tried first at every line start, so this only sees content.
        begin: r`^(?=.)`,
        end: "$",
        contentName: "string.unquoted.block.nova",
        patterns: tpl ? [{ include: "#interpolation" }] : [],
      },
      // Only reachable on the indicator line itself: content lines are
      // consumed whole by the rule above.
      { include: "#comment" },
    ],
  });

  // -- tables (§4.9) --------------------------------------------------------
  add("table", {
    begin: r`^( *)(?:(-)( +))?(?:(${IDENT})|(${QUOTED}))?(\[)([0-9]+)(\])(\{)([^}]*)(\})(:)`,
    end: r`^(?!\1 |\s*$)`,
    beginCaptures: {
      2: { name: "punctuation.definition.list.item.nova" },
      4: { name: "entity.name.tag.nova" },
      5: { name: "entity.name.tag.nova string.quoted.double.nova" },
      6: { name: "punctuation.definition.table.count.begin.nova" },
      7: { name: "constant.numeric.integer.table.count.nova" },
      8: { name: "punctuation.definition.table.count.end.nova" },
      9: { name: "punctuation.definition.table.columns.begin.nova" },
      10: {
        patterns: [
          { include: "#comma" },
          { match: IDENT, name: "support.type.property-name.table.nova" },
          { match: QUOTED, name: "support.type.property-name.table.nova string.quoted.double.nova" },
        ],
      },
      11: { name: "punctuation.definition.table.columns.end.nova" },
      12: { name: "punctuation.separator.key-value.nova" },
    },
    name: "meta.table.nova",
    patterns: [
      { include: "#comment" },
      {
        begin: r`^\s+(?=\S)`,
        end: "$",
        name: "meta.table.row.nova",
        patterns: [{ include: "#comma" }, inc("flow-value")],
      },
    ],
  });

  // -- block entries --------------------------------------------------------
  add("entry", {
    begin: r`^\s*(?:(-)\s+)?(?:(${IDENT})|(${QUOTED}))(:)(?=\s|$)`,
    end: "$",
    beginCaptures: {
      1: { name: "punctuation.definition.list.item.nova" },
      2: { name: "entity.name.tag.nova" },
      3: {
        name: "entity.name.tag.nova string.quoted.double.nova",
        ...(tpl ? { patterns: [{ include: "#interpolation" }] } : {}),
      },
      4: { name: "punctuation.separator.key-value.nova" },
    },
    name: "meta.mapping.entry.nova",
    patterns: [inc("inline-value")],
  });
  add("list-item", {
    begin: r`^\s*(-)(?=\s|$)`,
    end: "$",
    beginCaptures: { 1: { name: "punctuation.definition.list.item.nova" } },
    name: "meta.list.item.nova",
    patterns: [inc("inline-value")],
  });

  // -- template control lines (§9.3) -----------------------------------------
  if (tpl) {
    rules["template-control"] = {
      patterns: [
        {
          begin: r`^\s*(@)(for)(?=\s)`,
          end: r`(:)?\s*(?:(?<!\S)((#).*))?$`,
          beginCaptures: {
            1: { name: "punctuation.definition.keyword.nova" },
            2: { name: "keyword.control.loop.for.nova" },
          },
          endCaptures: {
            1: { name: "punctuation.separator.key-value.nova" },
            2: { name: "comment.line.number-sign.nova" },
            3: { name: "punctuation.definition.comment.nova" },
          },
          name: "meta.control.for.nova",
          patterns: [
            {
              match: r`\G\s+(${IDENT})(?:\s*(,)\s*(${IDENT}))?\s+(in)(?=\s)`,
              captures: {
                1: { name: "variable.other.loop.nova" },
                2: { name: "punctuation.separator.comma.nova" },
                3: { name: "variable.other.loop.nova" },
                4: { name: "keyword.control.in.nova" },
              },
            },
            { include: "#flow-value-tpl" },
          ],
        },
        {
          begin: r`^\s*(@)(if|else)(?=[\s:])(?:\s+(if)(?=\s))?`,
          end: r`(:)?\s*(?:(?<!\S)((#).*))?$`,
          beginCaptures: {
            1: { name: "punctuation.definition.keyword.nova" },
            2: { name: "keyword.control.conditional.nova" },
            3: { name: "keyword.control.conditional.nova" },
          },
          endCaptures: {
            1: { name: "punctuation.separator.key-value.nova" },
            2: { name: "comment.line.number-sign.nova" },
            3: { name: "punctuation.definition.comment.nova" },
          },
          name: "meta.control.conditional.nova",
          patterns: [{ include: "#condition" }],
        },
      ],
    };
    rules["condition"] = {
      patterns: [
        { match: r`==|!=`, name: "keyword.operator.comparison.nova" },
        { match: r`(?<![\w-])(?:and|or|not)(?![\w-])`, name: "keyword.operator.logical.nova" },
        {
          begin: r`\(`,
          end: r`\)`,
          beginCaptures: { 0: { name: "punctuation.section.group.begin.nova" } },
          endCaptures: { 0: { name: "punctuation.section.group.end.nova" } },
          name: "meta.group.condition.nova",
          patterns: [{ include: "#condition" }],
        },
        { include: "#flow-value-tpl" },
      ],
    };
    rules["spread-entry"] = {
      begin: r`^\s*(?=\.\.\.)`,
      end: "$",
      patterns: [{ include: "#inline-value-tpl" }],
    };
  }

  // -- directives (§4.2, §7.3, §9.2) ---------------------------------------
  add("directives", {
    patterns: [
      ...(tpl ? [{ include: "#template-directives" }] : []),
      { include: "#data-directives" },
    ],
  });

  add("body", {
    patterns: [
      docSeparator,
      { include: "#comment" },
      ...(tpl ? [{ include: "#template-control" }, { include: "#spread-entry" }] : []),
      inc("directives"),
      inc("block-string"),
      inc("table"),
      inc("entry"),
      inc("list-item"),
      inc("flow-value"),
    ],
  });

  return rules;
}

const directiveName = (name) => ({
  1: { name: "punctuation.definition.directive.nova" },
  2: { name: `keyword.control.directive.${name}.nova` },
});

const dataDirectives = {
  patterns: [
    {
      // @schema name@1.2.3#fingerprint
      match: r`^(@)(schema)(?=\s|$)(?:\s+(${IDENT})(@)([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.+-]*)?)?(?:(#)([0-9A-Fa-f]+))?)?`,
      captures: {
        ...directiveName("schema"),
        3: { name: "entity.name.type.schema.nova" },
        4: { name: "punctuation.separator.version.nova" },
        5: { name: "constant.numeric.version.nova" },
        6: { name: "punctuation.separator.fingerprint.nova" },
        7: { name: "constant.other.fingerprint.nova" },
      },
    },
    {
      match: r`^(@)(nova|template)(?=\s|$)(?:\s+([0-9]+\.[0-9]+))?`,
      captures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
        3: { name: "constant.numeric.version.nova" },
      },
    },
    {
      match: r`^(@)(mode|compat|envelope)(?=\s|$)(?:\s+(${IDENT}))?`,
      captures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
        3: { name: "support.constant.directive-argument.nova" },
      },
    },
    {
      match: r`^(@)(revision|base)(?=\s|$)(?:\s+(\S+))?`,
      captures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
        3: { name: "constant.other.revision.nova" },
      },
    },
    {
      begin: r`^(@)(scope|get|select)(?=\s|$)`,
      end: "$",
      beginCaptures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
      },
      patterns: [{ include: "#comment" }, { include: "#path" }],
    },
    {
      // Extension or unknown directive.
      match: r`^(@)(${IDENT})(?=\s|$)(.*)$`,
      captures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
        3: { patterns: [{ include: "#comment" }] },
      },
    },
  ],
};

const templateDirectives = {
  patterns: [
    {
      // @param name?: type attrs = default
      begin: r`^(@)(param)\s+(${IDENT})(\?)?\s*(:)`,
      end: "$",
      beginCaptures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
        3: { name: "variable.parameter.nova" },
        4: { name: "keyword.operator.optional.nova" },
        5: { name: "punctuation.separator.key-value.nova" },
      },
      name: "meta.directive.param.nova",
      patterns: [{ include: "source.nova.schema#field-tail" }],
    },
    {
      // @import "base.nova" as base
      begin: r`^(@)(import)(?=\s)`,
      end: "$",
      beginCaptures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
      },
      name: "meta.directive.import.nova",
      patterns: [
        { include: "#comment" },
        { include: "#string" },
        {
          match: r`(?<=\s)(as)\s+(${IDENT})`,
          captures: {
            1: { name: "keyword.control.as.nova" },
            2: { name: "variable.other.constant.nova" },
          },
        },
      ],
    },
    {
      // @let name = value  /  @let name:
      begin: r`^(@)(let)\s+(${IDENT})\s*(?:(=)|(:)(?=\s|$))`,
      end: "$",
      beginCaptures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
        3: { name: "variable.other.constant.nova" },
        4: { name: "keyword.operator.assignment.nova" },
        5: { name: "punctuation.separator.key-value.nova" },
      },
      name: "meta.directive.let.nova",
      patterns: [{ include: "#inline-value-tpl" }],
    },
  ],
};

const sharedDocRules = {
  comment,
  comma: { match: ",", name: "punctuation.separator.comma.nova" },
  variant: {
    match: r`(!)(${IDENT})`,
    captures: {
      0: { name: "constant.other.enum.variant.nova" },
      1: { name: "punctuation.definition.variant.nova" },
    },
  },
  reference: {
    match: r`(\$)(${IDENT})((?:\.(?:${IDENT}|${QUOTED})|\[[^\]\n]*\])*)`,
    name: "variable.other.reference.nova",
    captures: {
      1: { name: "punctuation.definition.variable.nova" },
      3: { patterns: [{ include: "#path" }] },
    },
  },
  spread: {
    match: r`\.\.\.(?=\$|[\[({])`,
    name: "keyword.operator.spread.nova",
  },
  // A bare token inside flow context (§4.7).
  "flow-scalar": {
    patterns: [
      { match: r`${WORD_START}(?:true|false)${WORD_END}`, name: "constant.language.boolean.nova" },
      { match: r`${WORD_START}null${WORD_END}`, name: "constant.language.null.nova" },
      { match: r`${WORD_START}${NUM_RATIONAL}${WORD_END}`, name: "constant.numeric.rational.nova" },
      { match: r`${WORD_START}${NUM_FLOAT}${WORD_END}`, name: "constant.numeric.float.nova" },
      { match: r`${WORD_START}${INT}${WORD_END}`, name: "constant.numeric.integer.nova" },
      {
        match: r`${WORD_START}(?![${RESERVED}]|\.\.\.)(?:[^${DELIM}:]|:(?![${DELIM}]|$))+`,
        name: "string.unquoted.flow.nova",
      },
    ],
  },
  // The value of `key: ...` or `- ...` when it is a bare scalar (§4.4): the
  // rest of the line up to a comment. Only applies if the whole remainder is
  // the scalar, so that numbers and keywords are recognised exactly.
  "inline-scalar": {
    patterns: [
      { match: r`(?<=\s)(?:true|false)${VALUE_END}`, name: "constant.language.boolean.nova" },
      { match: r`(?<=\s)null${VALUE_END}`, name: "constant.language.null.nova" },
      { match: r`(?<=\s)${NUM_RATIONAL}${VALUE_END}`, name: "constant.numeric.rational.nova" },
      { match: r`(?<=\s)${NUM_FLOAT}${VALUE_END}`, name: "constant.numeric.float.nova" },
      { match: r`(?<=\s)${INT}${VALUE_END}`, name: "constant.numeric.integer.nova" },
      {
        match: r`(?<=\s)(?![${RESERVED}]|\.\.\.|-(?:\s|$))(?:[^\s#]|(?<=\S)#|[ \t]+(?=[^\s#]))+`,
        name: "string.unquoted.plain.nova",
      },
    ],
  },
  // Paths (§7.1), used by @scope, patches, references and interpolations.
  path: {
    patterns: [
      { match: r`\.(?=\{)`, name: "punctuation.accessor.nova" },
      {
        begin: r`\{`,
        end: r`\}`,
        beginCaptures: { 0: { name: "punctuation.definition.projection.begin.nova" } },
        endCaptures: { 0: { name: "punctuation.definition.projection.end.nova" } },
        patterns: [
          { include: "#comma" },
          { match: IDENT, name: "variable.other.member.nova" },
        ],
      },
      {
        begin: r`\[`,
        end: r`\]`,
        beginCaptures: { 0: { name: "punctuation.definition.selector.begin.nova" } },
        endCaptures: { 0: { name: "punctuation.definition.selector.end.nova" } },
        name: "meta.selector.nova",
        patterns: [
          { match: r`\*`, name: "keyword.operator.wildcard.nova" },
          { match: r`\?!?`, name: "keyword.operator.filter.nova" },
          {
            match: r`\G(${IDENT})(?=\s*(?:=|!=|<=?|>=?))`,
            name: "variable.other.member.nova",
          },
          {
            match: r`(?<=\?|\?!)(${IDENT}(?:\.${IDENT})*)`,
            name: "variable.other.member.nova",
          },
          { match: r`!=|<=|>=|=|<|>`, name: "keyword.operator.comparison.nova" },
          { match: r`(?<=\s)in(?=\s)`, name: "keyword.operator.in.nova" },
          { include: "#flow-value" },
        ],
      },
      { match: r`\.`, name: "punctuation.accessor.nova" },
      { match: IDENT, name: "variable.other.member.nova" },
      { include: "#string" },
    ],
  },
  "data-directives": dataDirectives,
  "template-directives": templateDirectives,
};

const documentGrammar = {
  $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  name: "NOVA",
  scopeName: "source.nova",
  fileTypes: ["nova"],
  patterns: [
    {
      // A template (§9.2): `@template` is the first directive after an
      // optional `@nova`. Everything from there to the end of the file is
      // highlighted with template rules.
      begin: r`^(?=@template(?:\s|$))`,
      end: NEVER,
      name: "meta.template.nova",
      patterns: [{ include: "#body-tpl" }],
    },
    {
      // A patch (§7.4) written in a .nova file or opened as plain NOVA.
      begin: r`^(?=@patch(?:\s|$))`,
      end: NEVER,
      patterns: [{ include: "source.nova.patch" }],
    },
    { include: "#body" },
  ],
  repository: {
    ...sharedDocRules,
    ...documentRules(false),
    ...documentRules(true),
  },
};

// ---------------------------------------------------------------------------
// Patch grammar (source.nova.patch, §7.4)
// ---------------------------------------------------------------------------

const PATH_HEAD = r`(?:${IDENT}|${QUOTED}|\[[^\]\n]*\]|\.)`;
const PATH = r`${PATH_HEAD}(?:\.(?:${IDENT}|${QUOTED})|\[[^\]\n]*\])*`;

const patchGrammar = {
  $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  name: "NOVA Patch",
  scopeName: "source.nova.patch",
  fileTypes: ["nova-patch"],
  patterns: [
    { include: "source.nova#comment" },
    { include: "#patch-directive" },
    { include: "source.nova#data-directives" },
    { include: "#operation" },
    { include: "#replace" },
    { include: "source.nova#flow-value" },
  ],
  repository: {
    "patch-directive": {
      // @patch [schema-ref] [sha256:base]
      begin: r`^(@)(patch)(?=\s|$)`,
      end: "$",
      beginCaptures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.patch.nova" },
      },
      patterns: [
        { include: "source.nova#comment" },
        { match: r`(?<=\s)sha256:[0-9A-Fa-f]*`, name: "constant.other.revision.nova" },
        {
          match: r`(?<=\s)(${IDENT})(@)([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.+-]*)?)(?:(#)([0-9A-Fa-f]+))?`,
          captures: {
            1: { name: "entity.name.type.schema.nova" },
            2: { name: "punctuation.separator.version.nova" },
            3: { name: "constant.numeric.version.nova" },
            4: { name: "punctuation.separator.fingerprint.nova" },
            5: { name: "constant.other.fingerprint.nova" },
          },
        },
      ],
    },
    operation: {
      // = p: v   + p: v   - p[: old]   ? p[: v]
      begin: r`^([=+\-?])(?=\s)\s*(${PATH})(?:(:)(?=\s|$))?`,
      end: "$",
      beginCaptures: {
        1: { name: "keyword.operator.patch.nova" },
        2: { name: "meta.path.nova", patterns: [{ include: "source.nova#path" }] },
        3: { name: "punctuation.separator.key-value.nova" },
      },
      name: "meta.patch.operation.nova",
      patterns: [{ include: "source.nova#flow-value" }],
    },
    replace: {
      // p: old -> new
      begin: r`^(${PATH})(:)(?=\s)`,
      end: "$",
      beginCaptures: {
        1: { name: "meta.path.nova", patterns: [{ include: "source.nova#path" }] },
        2: { name: "punctuation.separator.key-value.nova" },
      },
      name: "meta.patch.operation.replace.nova",
      patterns: [
        { match: r`(?<=\s)->(?=\s|$)`, name: "keyword.operator.arrow.nova" },
        { include: "source.nova#flow-value" },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Schema grammar (source.nova.schema, §6.1)
// ---------------------------------------------------------------------------

const BUILTIN_TYPES =
  "any|null|bool|float|decimal|rational|string|bytes|timestamp|duration|int|i8|i16|i32|i64|u8|u16|u32|u64";

const schemaGrammar = {
  $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  name: "NOVA Schema",
  scopeName: "source.nova.schema",
  fileTypes: ["novs"],
  patterns: [
    { include: "source.nova#comment" },
    {
      match: r`^(@)(root)(?=\s|$)(?:\s+(${IDENT}))?`,
      captures: {
        1: { name: "punctuation.definition.directive.nova" },
        2: { name: "keyword.control.directive.nova" },
        3: { name: "entity.name.type.nova-schema" },
      },
    },
    { include: "source.nova#data-directives" },
    { include: "#record" },
    { include: "#enum" },
    { include: "#alias" },
    { include: "#field" },
    { include: "#variant-line" },
  ],
  repository: {
    record: {
      match: r`^(record)\s+(${IDENT})((?:\s+@open)*)\s*(:)`,
      captures: {
        1: { name: "storage.type.record.nova-schema" },
        2: { name: "entity.name.type.record.nova-schema" },
        3: {
          patterns: [
            {
              match: r`(@)(open)`,
              captures: {
                0: { name: "storage.modifier.open.nova-schema" },
                1: { name: "punctuation.definition.attribute.nova-schema" },
              },
            },
          ],
        },
        4: { name: "punctuation.separator.key-value.nova-schema" },
      },
    },
    enum: {
      patterns: [
        {
          match: r`^(enum)\s+(${IDENT})\s*(:)`,
          captures: {
            1: { name: "storage.type.enum.nova-schema" },
            2: { name: "entity.name.type.enum.nova-schema" },
            3: { name: "punctuation.separator.key-value.nova-schema" },
          },
        },
        {
          begin: r`^(enum)\s+(${IDENT})\s*(=)`,
          end: "$",
          beginCaptures: {
            1: { name: "storage.type.enum.nova-schema" },
            2: { name: "entity.name.type.enum.nova-schema" },
            3: { name: "keyword.operator.assignment.nova-schema" },
          },
          patterns: [
            { include: "source.nova#comment" },
            { match: r`\|`, name: "keyword.operator.union.nova-schema" },
            { include: "#variant" },
          ],
        },
      ],
    },
    alias: {
      begin: r`^(type)\s+(${IDENT})\s*(=)`,
      end: "$",
      beginCaptures: {
        1: { name: "storage.type.alias.nova-schema" },
        2: { name: "entity.name.type.alias.nova-schema" },
        3: { name: "keyword.operator.assignment.nova-schema" },
      },
      patterns: [{ include: "#field-tail" }],
    },
    field: {
      begin: r`^(\s+)(?:(${IDENT})|(${QUOTED}))(\?)?\s*(:)(?=\s|$)`,
      end: "$",
      beginCaptures: {
        2: { name: "variable.other.property.nova-schema" },
        3: { name: "variable.other.property.nova-schema string.quoted.double.nova" },
        4: { name: "keyword.operator.optional.nova-schema" },
        5: { name: "punctuation.separator.key-value.nova-schema" },
      },
      name: "meta.field.nova-schema",
      patterns: [{ include: "#field-tail" }],
    },
    "variant-line": {
      begin: r`^\s+(?=[A-Za-z_])`,
      end: "$",
      patterns: [{ include: "source.nova#comment" }, { include: "#variant" }],
    },
    variant: {
      patterns: [
        {
          begin: r`(${IDENT})\s*(\()`,
          end: r`\)`,
          beginCaptures: {
            1: { name: "constant.other.enum.variant.nova-schema" },
            2: { name: "punctuation.section.parens.begin.nova-schema" },
          },
          endCaptures: { 0: { name: "punctuation.section.parens.end.nova-schema" } },
          patterns: [{ include: "#type" }],
        },
        { match: IDENT, name: "constant.other.enum.variant.nova-schema" },
      ],
    },
    // Everything after `name:` in a field, alias or @param: type, attributes, default.
    "field-tail": {
      patterns: [
        { include: "source.nova#comment" },
        {
          begin: r`(?<=\s|^)(=)(?=\s)`,
          end: r`(?=$)`,
          beginCaptures: { 1: { name: "keyword.operator.assignment.nova-schema" } },
          contentName: "meta.default-value.nova-schema",
          patterns: [{ include: "source.nova#inline-value" }],
        },
        { include: "#type" },
      ],
    },
    type: {
      patterns: [
        { include: "#attribute" },
        { match: r`\b(?:${BUILTIN_TYPES})\b(?![\w-])`, name: "support.type.builtin.nova-schema" },
        {
          match: r`\b(list|set|map)\s*(<)`,
          captures: {
            1: { name: "support.type.builtin.generic.nova-schema" },
            2: { name: "punctuation.definition.typeparameters.begin.nova-schema" },
          },
        },
        { match: ">", name: "punctuation.definition.typeparameters.end.nova-schema" },
        { match: r`\[\]`, name: "storage.modifier.array.nova-schema" },
        { match: r`\?`, name: "storage.modifier.nullable.nova-schema" },
        { match: r`\(`, name: "punctuation.definition.tuple.begin.nova-schema" },
        { match: r`\)`, name: "punctuation.definition.tuple.end.nova-schema" },
        { match: ",", name: "punctuation.separator.comma.nova-schema" },
        { match: IDENT, name: "entity.name.type.nova-schema" },
      ],
    },
    attribute: {
      patterns: [
        {
          begin: r`(@)(range|len|id|${IDENT})(\()`,
          end: r`\)`,
          beginCaptures: {
            1: { name: "punctuation.definition.attribute.nova-schema" },
            2: { name: "entity.other.attribute-name.nova-schema" },
            3: { name: "punctuation.section.arguments.begin.nova-schema" },
          },
          endCaptures: { 0: { name: "punctuation.section.arguments.end.nova-schema" } },
          name: "meta.attribute.nova-schema",
          patterns: [
            { match: r`\.\.`, name: "keyword.operator.range.nova-schema" },
            { match: ",", name: "punctuation.separator.comma.nova-schema" },
            {
              match: r`\b(?:scalars|utf8|utf16|graphemes)\b`,
              name: "support.constant.unit.nova-schema",
            },
            {
              match: r`-?(?:0|[1-9][0-9]*)(?:/[1-9][0-9]*|(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)`,
              name: "constant.numeric.nova-schema",
            },
            { include: "source.nova#string" },
          ],
        },
        {
          match: r`(@)(${IDENT})`,
          captures: {
            0: { name: "meta.attribute.nova-schema" },
            1: { name: "punctuation.definition.attribute.nova-schema" },
            2: { name: "entity.other.attribute-name.nova-schema" },
          },
        },
      ],
    },
  },
};

// ---------------------------------------------------------------------------

function clean(value) {
  // Drop `undefined` keys so the JSON stays tidy.
  return JSON.parse(JSON.stringify(value));
}

for (const [file, grammar] of [
  ["nova.tmLanguage.json", documentGrammar],
  ["nova-patch.tmLanguage.json", patchGrammar],
  ["nova-schema.tmLanguage.json", schemaGrammar],
]) {
  writeFileSync(join(out, file), JSON.stringify(clean(grammar), null, 2) + "\n");
  console.log(`wrote syntaxes/${file}`);
}
