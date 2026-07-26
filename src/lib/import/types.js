// Canonical model shared by every bank adapter (pdf-import-plan.md §5). Adding a bank means
// adding one adapter that emits these shapes — nothing downstream changes.

/**
 * @typedef {Object} NormalizedTransaction
 * @property {string}      date            ISO date string 'yyyy-MM-dd' (boekingsdatum)
 * @property {number}      amount          ALWAYS positive; direction carries the sign
 * @property {'debit'|'credit'} direction  derived from the literal sign on the statement
 * @property {string}      counterparty    display name as printed
 * @property {string}      counterpartyKey normalized key for learned wallet mappings
 * @property {string|null} counterpartyIban
 * @property {string|null} counterpartyBic
 * @property {string}      note            Mededeling (transfers) | merchant + channel (cards)
 * @property {string|null} typeKeyword     e.g. 'Instantoverschrijving', 'Betaling met KBC-Debetkaart'
 * @property {string|null} channel         e.g. 'Bancontact', 'Debit Mastercard'
 * @property {'card'|'transfer'|'direct-debit'|'unknown'} kind
 * @property {string|null} structuredReference  '+++nnn/nnnn/nnnnn+++' when the Mededeling is one
 * @property {string[]}    raw             source lines this transaction was parsed from
 */

/**
 * @typedef {Object} ParsedStatement
 * @property {string}      bank            adapter id, e.g. 'kbc'
 * @property {string}      format          e.g. 'kbc-mobile-export'
 * @property {string|null} accountIban     the OWN account, never the counterparty
 * @property {string|null} accountHolder
 * @property {string|null} currency
 * @property {NormalizedTransaction[]} transactions
 * @property {string[]}    warnings        non-fatal parse notes surfaced in the preview
 */

/**
 * @typedef {Object} ParseFailure
 * @property {false}  ok
 * @property {string} reason  user-facing explanation of what could not be parsed
 */

export {}
