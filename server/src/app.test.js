import test from 'node:test';
import assert from 'node:assert/strict';
import { statusOf } from './status.js';

test('retiro exacto completo',()=>assert.equal(statusOf({kind:'WITHDRAWAL',purpose:'INVOICE_PAYMENT',amount:100000,settled_amount:100000,returned_amount:0,pending_invoice_count:0,invoice_mode:'EXACT'}),'COMPLETE'));
test('factura pendiente de número',()=>assert.equal(statusOf({kind:'WITHDRAWAL',purpose:'INVOICE_PAYMENT',amount:100000,settled_amount:100000,returned_amount:0,pending_invoice_count:1,invoice_mode:'EXACT'}),'PENDING_INVOICE'));
test('factura con vuelto pendiente',()=>assert.equal(statusOf({kind:'WITHDRAWAL',purpose:'INVOICE_PAYMENT',amount:875400,settled_amount:835400,returned_amount:0,pending_invoice_count:0,invoice_mode:'CHANGE'}),'RETURN_PENDING'));
test('gasto directo queda completo',()=>assert.equal(statusOf({kind:'WITHDRAWAL',purpose:'DIRECT_EXPENSE',amount:40000,settled_amount:0,returned_amount:0,pending_invoice_count:0}),'COMPLETE'));
