import test from 'node:test';
import assert from 'node:assert/strict';
import { statusOf } from './status.js';
test('retiro completo',()=>assert.equal(statusOf({kind:'WITHDRAWAL',amount:100000,settled_amount:86450,returned_amount:13550,pending_invoice_count:0,expected_expense_amount:86450}),'COMPLETE'));
test('factura pendiente',()=>assert.equal(statusOf({kind:'WITHDRAWAL',amount:100000,settled_amount:86450,returned_amount:0,pending_invoice_count:1,expected_expense_amount:86450}),'PENDING_INVOICE'));
test('vuelto pendiente',()=>assert.equal(statusOf({kind:'WITHDRAWAL',amount:875400,settled_amount:835400,returned_amount:0,pending_invoice_count:0,expected_expense_amount:835400}),'RETURN_PENDING'));
