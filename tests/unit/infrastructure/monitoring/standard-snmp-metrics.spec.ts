import { describe, expect, it } from 'vitest';

import {
  parseStandardSnmpMetrics,
  standardSnmpOids,
} from '../../../../backend/infrastructure/monitoring/standard-snmp-metrics.js';

describe('standard SNMP metric parser', () => {
  it('parsea HOST-RESOURCES y MIB-II sin OIDs propietarios', () => {
    const values = [
      { oid: standardSnmpOids.sysUpTime, value: 123_456 },
      { oid: `${standardSnmpOids.hrProcessorLoad}.1`, value: 20 },
      { oid: `${standardSnmpOids.hrProcessorLoad}.2`, value: 40 },
      { oid: `${standardSnmpOids.hrStorageType}.7`, value: standardSnmpOids.hrStorageRam },
      { oid: `${standardSnmpOids.hrStorageAllocationUnits}.7`, value: 4_096 },
      { oid: `${standardSnmpOids.hrStorageSize}.7`, value: 1_000 },
      { oid: `${standardSnmpOids.hrStorageUsed}.7`, value: 250 },
      { oid: `${standardSnmpOids.ifOperStatus}.1`, value: 1 },
      { oid: `${standardSnmpOids.ifOperStatus}.2`, value: 2 },
      { oid: `${standardSnmpOids.ifOperStatus}.3`, value: 5 },
    ];

    expect(parseStandardSnmpMetrics(values)).toEqual({
      cpuUsage: 30,
      interfacesDown: 1,
      interfacesUp: 1,
      memoryTotal: 4_096_000,
      memoryUsed: 1_024_000,
      uptime: 1_234,
    });
  });

  it('omite métricas cuando no hay filas completas y válidas', () => {
    expect(
      parseStandardSnmpMetrics([
        { oid: standardSnmpOids.sysUpTime, value: -1 },
        { oid: `${standardSnmpOids.hrProcessorLoad}.1`, value: 101 },
        {
          oid: `${standardSnmpOids.hrStorageType}.4`,
          value: standardSnmpOids.hrStorageRam,
        },
      ]),
    ).toEqual({});
  });

  it('acepta OIDs con punto inicial y valores numéricos representados como string', () => {
    expect(
      parseStandardSnmpMetrics([
        { oid: `.${standardSnmpOids.sysUpTime}`, value: '500' },
        { oid: `.${standardSnmpOids.ifOperStatus}.1`, value: '1' },
      ]),
    ).toEqual({ interfacesDown: 0, interfacesUp: 1, uptime: 5 });
  });
});
