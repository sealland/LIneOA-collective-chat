/**
 * Cluster time / sender propagation checks.
 * Run: npx tsx src/tests/messageClusterTime.check.ts
 */
import {
  confidenceForInheritedTime,
  propagateClusterTimeRaw,
  propagateOutboundSenderNames,
} from '../automation/utils/messageClusterTime.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

{
  const raws = [
    { timeRaw: null, hasEmployeeHeader: false, align: 'left' },
    { timeRaw: null, hasEmployeeHeader: false, align: 'left' },
    { timeRaw: '13.13 น.', hasEmployeeHeader: false, align: 'left' },
    { timeRaw: '14.20 น.', hasEmployeeHeader: true, align: 'right' },
  ];
  const out = propagateClusterTimeRaw(raws);
  assert(out[0]!.timeRaw === '13.13 น.', 'first inbound inherits cluster time');
  assert(out[1]!.timeRaw === '13.13 น.', 'second inbound inherits cluster time');
  assert(out[2]!.timeRaw === '13.13 น.', 'timed bubble unchanged');
  assert(out[3]!.timeRaw === '14.20 น.', 'outbound cluster separate');
}

{
  const raws = [
    { timeRaw: '10.00 น.', hasEmployeeHeader: false, align: 'left' },
    { timeRaw: null, hasEmployeeHeader: true, align: 'right' },
    { timeRaw: '10.05 น.', hasEmployeeHeader: true, align: 'right' },
  ];
  const out = propagateClusterTimeRaw(raws);
  assert(out[1]!.timeRaw === '10.05 น.', 'outbound middle inherits from cluster end');
}

{
  // Sticker ack: no header of its own, but has อ่านแล้ว → outbound; inherit Tikky
  const raws = [
    {
      timeRaw: '8.40 น.',
      hasEmployeeHeader: true,
      align: 'right',
      hasReadReceipt: false,
      employeeName: 'Tikky',
    },
    {
      timeRaw: '8.45 น.',
      hasEmployeeHeader: false,
      align: '',
      hasReadReceipt: true,
      employeeName: null,
    },
  ];
  const out = propagateOutboundSenderNames(raws);
  assert(out[1]!.employeeName === 'Tikky', 'sticker inherits agent name');
  assert(out[1]!.hasEmployeeHeader === true, 'sticker marked outbound');
}

{
  const raws = [
    {
      timeRaw: '8.45 น.',
      hasEmployeeHeader: false,
      align: '',
      hasReadReceipt: true,
      employeeName: null,
    },
  ];
  const timed = propagateClusterTimeRaw(raws);
  assert(timed[0]!.timeRaw === '8.45 น.', 'read-receipt bubble keeps its clock');
  const named = propagateOutboundSenderNames(timed);
  assert(named[0]!.hasEmployeeHeader === true, 'read receipt alone ⇒ outbound');
}

assert(confidenceForInheritedTime('7 ส.ค. 2026') === 'HIGH', 'inherited + absolute date');
assert(confidenceForInheritedTime('วันนี้') === 'MEDIUM', 'inherited + relative date');
assert(confidenceForInheritedTime(null) === 'LOW', 'inherited without divider');

console.log('messageClusterTime.check.ts — all assertions passed');
