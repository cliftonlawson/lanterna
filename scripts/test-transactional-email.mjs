import assert from 'node:assert/strict';
import { createDeliveryEmailPayload } from '../src/server/transactionalEmail.js';

const input = {
  html: '<p>Your gallery is ready.</p>',
  senderName: 'Retrosound Films',
  subject: 'Burke & Ryka is ready',
  text: 'Your gallery is ready.',
  to: 'couple@example.com',
};

const branded = createDeliveryEmailPayload({
  EMAIL_FROM: 'LANTERNA <deliver@lanterna.video>',
}, input);
assert.equal(branded.from, 'Retrosound Films <deliver@lanterna.video>');

const bareAddress = createDeliveryEmailPayload({
  EMAIL_FROM: 'deliver@lanterna.video',
}, input);
assert.equal(bareAddress.from, 'Retrosound Films <deliver@lanterna.video>');

const sanitized = createDeliveryEmailPayload({
  EMAIL_FROM: 'LANTERNA <deliver@lanterna.video>',
}, {
  ...input,
  senderName: 'Retrosound\n<Films>',
});
assert.equal(sanitized.from, 'Retrosound Films <deliver@lanterna.video>');

const platformFallback = createDeliveryEmailPayload({
  EMAIL_FROM: 'LANTERNA <deliver@lanterna.video>',
}, {
  ...input,
  senderName: '',
});
assert.equal(platformFallback.from, 'LANTERNA <deliver@lanterna.video>');

console.log('transactional email checks passed');
