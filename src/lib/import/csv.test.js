import { describe, it, expect } from 'vitest'
import { parseDelimited } from './csv.js'

describe('parseDelimited', () => {
  it('splits a plain semicolon file', () => {
    expect(parseDelimited('a;b;c\r\n1;2;3', ';')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('treats a bare CR as a line terminator (the KBC export has no LF at all)', () => {
    expect(parseDelimited('a;b\r1;2\r', ';')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('counts CRLF as one terminator, not two', () => {
    expect(parseDelimited('a\r\nb\r\n', ';')).toEqual([['a'], ['b']])
  })

  it('handles LF-only files', () => {
    expect(parseDelimited('a;b\n1;2\n', ';')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('strips a leading BOM so the first header is still matchable', () => {
    expect(parseDelimited('﻿Rekeningnummer;Datum', ';')[0][0]).toBe('Rekeningnummer')
  })

  it('keeps a quoted delimiter inside its field instead of shifting every later column', () => {
    expect(parseDelimited('a;"b;c";d', ';')).toEqual([['a', 'b;c', 'd']])
  })

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseDelimited('a;"say ""hi""";b', ';')).toEqual([['a', 'say "hi"', 'b']])
  })

  it('keeps a newline inside a quoted field', () => {
    expect(parseDelimited('a;"line1\r\nline2";b', ';')).toEqual([['a', 'line1\r\nline2', 'b']])
  })

  it('preserves empty fields, including trailing ones', () => {
    expect(parseDelimited('a;;c;', ';')).toEqual([['a', '', 'c', '']])
  })

  it('keeps a quoted empty field as a field', () => {
    expect(parseDelimited('a;"";c', ';')).toEqual([['a', '', 'c']])
  })

  it('drops blank lines rather than emitting phantom rows', () => {
    expect(parseDelimited('a;b\r\r1;2\r\r', ';')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('reads a final row that has no terminator', () => {
    expect(parseDelimited('a;b\r1;2', ';')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('returns nothing for empty input', () => {
    expect(parseDelimited('', ';')).toEqual([])
    expect(parseDelimited(null, ';')).toEqual([])
  })

  it('only treats a quote as an opener at the START of a field', () => {
    // A stray quote mid-value must stay literal, otherwise one typo in a merchant name would
    // swallow the rest of the file as a single quoted field.
    expect(parseDelimited('a;b"c;d', ';')).toEqual([['a', 'b"c', 'd']])
  })
})
