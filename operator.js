function operatorSummary(d, exchange) {
  const islanded = d.mode === 'Islanded';
  if (d.comm === 'Offline') {
    return ['danger', 'Telemetry lost', 'Power flow, bus voltage and battery readings cannot be verified. Check the communications alarm.'];
  }
  if (islanded && exchange > 0) {
    return ['danger', 'Islanded · load exceeds supply', `${exchange} kW of demand is unmet with the utility disconnected.`];
  }
  if (d.voltage < 720 || d.voltage > 780) {
    return ['danger', 'DC bus voltage out of range', `${d.voltage} V measured against a demo operating band of 720–780 V.`];
  }
  if (d.temp >= 50) {
    return ['danger', 'Battery temperature high', `Battery is at ${d.temp} °C. The demo alarm starts at 50 °C.`];
  }
  if (shutdown) return ['danger', 'Battery disconnected', 'Battery storage is unavailable in the simulation.'];
  if (d.comm === 'Degraded') return ['warn', 'Communications degraded', 'Displayed readings may be stale.'];
  if (d.soc < 20) return ['warn', 'Battery reserve low', `${d.soc}% charge remains. The demo warning starts below 20%.`];
  if (islanded && exchange < 0) return ['warn', 'Islanded · surplus generation', `${-exchange} kW of local supply has no matching demand.`];
  if (islanded) return ['', 'Islanded · local sources cover demand', 'The utility is disconnected. Local supply matches the load.'];
  if (exchange < 0) return ['', 'Local surplus is exported', `The utility is receiving ${-exchange} kW after site demand and battery charging.`];
  if (exchange > 0) return ['', 'Grid connected · utility supplementing supply', `The utility is supplying ${exchange} kW to cover the remaining demand.`];
  return ['', 'Local sources cover demand', 'The utility is connected with no net power exchange.'];
}

function statusStrip(d, exchange) {
  const [tone, title, detail] = operatorSummary(d, exchange);
  const grid = d.comm === 'Offline' ? 'Grid state unverified' : d.mode;
  const quality = {Online: 'Telemetry online', Degraded: 'Telemetry degraded · values may be stale', Offline: 'Telemetry offline'}[d.comm];
  return `<section class="status-strip ${tone}" aria-label="Operating status" aria-live="polite">
    <div><div class="status-context">${grid} · ${quality}</div><h2>${title}</h2><p>${detail}</p></div>
  </section>`;
}

function panelHeader(title, detail) {
  return `<div class="panel-head"><div><h2>${title}</h2><p>${detail}</p></div></div>`;
}

function meter(label, value, unit, explanation, position, marker, tone = '') {
  return `<div class="reading ${tone}">
    <div><b>${label}</b><strong>${value}<small> ${unit}</small></strong></div>
    <div class="track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, position))}%"></span>${marker == null ? '' : `<i style="left:${marker}%"></i>`}</div>
    <p>${explanation}</p></div>`;
}

function stationReadings(d) {
  return `<div class="readings">${voltageReading(d)}${reserveReading(d)}</div>`;
}

function voltageReading(d) {
  const abnormal = d.voltage < 720 || d.voltage > 780;
  return `<div class="reading ${abnormal ? 'danger' : ''}">
    <div><b>DC bus voltage</b><strong>${d.voltage}<small> V</small></strong></div>
    <div class="track range-track" aria-hidden="true"><span></span><i style="left:${Math.max(1, Math.min(99, (d.voltage - 690) / 1.2))}%"></i></div>
    <p>${abnormal ? (d.voltage < 720 ? 'Below' : 'Above') : 'Within'} demo band · 720–780 V</p>
  </div>`;
}

function reserveReading(d) {
  return meter('Battery reserve', d.soc, '%', `${d.soc < 20 ? 'Low reserve' : 'Reserve available'} · warning below 20%`, d.soc, 20, d.soc < 20 ? 'warn' : '');
}

function batteryState(d) {
  if (shutdown) return 'Disconnected from the DC bus';
  if (d.battery < 0) return 'Charging from the DC bus';
  if (d.battery > 0) return 'Supplying the DC bus';
  return 'On standby · no power exchange';
}

function flowItem(name, power, color, link) {
  return {name, power, color, link};
}

function flowLane(title, items, scale) {
  const positive = items.filter(item => item.power > 0);
  return `<div class="flow-lane"><div class="flow-label"><b>${title}</b><span>${positive.reduce((sum, item) => sum + item.power, 0)} kW</span></div>
    <div class="flow-track" aria-hidden="true">${positive.map(item => `<span class="${item.color}" style="width:${100 * item.power / scale}%"></span>`).join('')}</div>
    <div class="flow-key">${items.map(item => {
      const label = `<i class="${item.color}"></i>${item.name} <b>${item.power} kW</b>`;
      return item.link ? `<button class="flow-chip" data-go="${item.link}">${label} <span aria-hidden="true">›</span></button>` : `<span class="flow-chip">${label}</span>`;
    }).join('')}</div></div>`;
}

function gridPanel(d, exchange) {
  const islanded = d.mode === 'Islanded';
  const supply = [flowItem('Solar', d.solar, 'solar', 'solar'), flowItem('Wind', d.wind, 'wind', 'wind')];
  const use = [flowItem('Site load', d.load, 'load')];
  if (d.battery > 0) supply.push(flowItem('Battery discharge', d.battery, 'battery', 'battery'));
  if (d.battery < 0) use.push(flowItem('Battery charging', -d.battery, 'battery', 'battery'));
  if (!islanded && exchange > 0) supply.push(flowItem('Utility import', exchange, 'utility'));
  if (!islanded && exchange < 0) use.push(flowItem('Utility export', -exchange, 'utility'));
  const total = items => items.reduce((sum, item) => sum + item.power, 0);
  const scale = Math.max(total(supply), total(use), 1);
  return `<section class="panel">${panelHeader('Power balance', 'Compare supply and demand on the same scale. Select a source for details.')}
    ${flowLane('Power supplied', supply, scale)}${flowLane('Demand and export', use, scale)}
    <div class="bus-note"><b>Battery storage</b> <span>${batteryState(d)}</span> <button class="text-link" data-go="battery">Battery details ›</button></div>
    ${stationReadings(d)}</section>`;
}

function sourcePanel(d, source) {
  const isBattery = source === 'battery';
  const output = d[source];
  const mode = isBattery ? batteryState(d) : output > 0 ? 'Supplying the DC bus' : 'No generation';
  const localSupply = d.solar + d.wind + Math.max(0, d.battery);
  const share = output > 0 && localSupply > 0 ? Math.round(100 * output / localSupply) : 0;
  const highTemp = d.temp >= 50;
  const reading = isBattery
    ? `${reserveReading(d)}${meter('Battery temperature', d.temp, '°C', `${highTemp ? 'High temperature' : 'Below alarm threshold'} · alarm at 50 °C`, d.temp, 50, highTemp ? 'danger' : '')}`
    : `${meter('Share of local supply', localSupply > 0 ? share : '—', localSupply > 0 ? '%' : '', localSupply > 0 ? 'Of total solar, wind and battery discharge. Utility import is excluded.' : 'No local sources are supplying power.', share, null)}${voltageReading(d)}`;
  return `<section class="panel source-panel"><div class="source-main">
    <div><div class="metric-label">${views[source][1].toUpperCase()}</div><h2>${mode}</h2></div>
    <strong>${Math.abs(output)} <small>kW</small></strong></div>
    <div class="readings">${reading}</div>
    <button class="text-link" data-go="overview">‹ Back to grid overview</button>
  </section>`;
}

function unavailablePanel() {
  return `<section class="panel unavailable">${panelHeader('Readings unavailable', 'The simulated communications link is offline.')}
    <p>Source output, load coverage, battery condition and bus voltage cannot be verified.</p>
  </section>`;
}


