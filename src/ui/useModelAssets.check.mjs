import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const source = readFileSync(new URL('./useModelAssets.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const state = status => ({ status, downloadedBytes: 10, totalBytes: 100, currentFile: 'model', errorCode: null });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function harness() {
  const slots = [];
  let index = 0, effect, cleanup, mounted = true, afterUnmount = 0, listener, calls = 0, pauses = 0, unsubscribed = 0;
  const read = deferred(), download = deferred(), pause = deferred();
  const exports = {};
  const react = {
    useState(initial) {
      const key = index++;
      slots[key] ??= typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { if (!mounted) afterUnmount++; else slots[key] = value; }];
    },
    useRef(initial) { const key = index++; return slots[key] ??= { current: initial }; },
    useEffect(callback) { effect = callback; },
    useCallback(callback) { return callback; },
  };
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return react;
    assert.equal(name, '../../modules/chroma-analysis');
    return {
      getModelAssetStatus: () => read.promise,
      downloadModelAssets: () => { calls++; return download.promise; },
      pauseModelDownload: () => { pauses++; return pause.promise; },
      subscribeModelAssets: callback => { listener = callback; return () => { unsubscribed++; }; },
    };
  } });
  const render = () => { index = 0; return exports.useModelAssets(); };
  render(); cleanup = effect();
  return { read, download, pause, render, emit: next => listener(next), get calls() { return calls; }, get pauses() { return pauses; },
    get afterUnmount() { return afterUnmount; }, get unsubscribed() { return unsubscribed; },
    unmount() { mounted = false; cleanup(); } };
}

const a = harness();
assert.equal(a.render().startupChecked, false);
assert.equal(a.calls, 0, 'mount must never start the large download');
a.emit(state('required'));
assert.equal(a.render().startupChecked, true);
a.emit(state('checking'));
assert.equal(a.render().startupChecked, true, 'rechecking must not re-enter startup');
a.emit(state('required'));
a.render().start(); a.render().start();
assert.equal(a.calls, 1, 'double tap must start only once');
a.emit(state('downloading'));
a.read.resolve(state('required')); await flush();
assert.equal(a.render().state.status, 'downloading', 'late initial read must not replace newer progress');
a.render().pause(); a.render().pause();
assert.equal(a.pauses, 1);
a.pause.resolve(state('paused')); await flush();
a.download.resolve(state('ready')); await flush();
assert.equal(a.render().state.status, 'paused', 'old download completion must not overwrite pause');
a.unmount(); a.emit(state('ready'));
assert.equal(a.afterUnmount, 0); assert.equal(a.unsubscribed, 1);

const b = harness();
b.read.reject(new Error('network_failed')); await flush();
assert.equal(b.render().state.status, 'failed', 'initial snapshot rejection must expose retry');
b.render().start(); b.unmount(); b.download.reject(new Error('late_failure')); await flush();
assert.equal(b.afterUnmount, 0, 'late rejection must not update an unmounted gate');

const c = harness();
c.read.resolve(state('required')); await flush(); c.render().start();
c.emit(state('downloading')); c.emit(state('verifying'));
c.download.resolve(state('ready')); await flush();
assert.equal(c.render().state.status, 'ready', 'final download snapshot must finish setup after progress events');
c.unmount();
const screenExports = {};
const screenSource = readFileSync(new URL('./screens/ModelSetupScreen.tsx', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(screenSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
} }).outputText, { exports: screenExports, require(name) {
  const modules = {
    react: React,
    'react-native': { View: 'View', StyleSheet: { create: value => value } },
    'react-native-reanimated': { default: { View: 'AnimatedView' } },
    '../components/motion': { useLiveReduceMotion: () => false },
    '../primitives': { Screen: 'Screen', Button: 'Button', Notice: 'Notice' },
    '../components/ProcessingStep': { ProcessingStep: 'ProcessingStep' },
    '../components/SemanticText': { SemanticText: 'SemanticText' },
    '../theme': { theme: { typography: {}, spacing: {}, colors: {}, radii: {} } },
  };
  assert.ok(name in modules, name); return modules[name];
} });
function nodes(element) {
  return !React.isValidElement(element) ? [] : [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}
for (const locale of ['ko', 'en']) {
  const render = (status, extra = {}) => screenExports.ModelSetupScreen({ locale, state: { ...state(status), ...extra }, pending: null, start() {}, pause() {} });
  assert.equal(render('required').props.footer.type, 'Button', 'download requires an explicit button');
  assert.equal(render('paused').props.footer.type, 'Button', 'paused downloads can resume');
  assert.equal(render('failed', { errorCode: 'analysis_unsupported_device' }).props.footer, undefined);
  assert.equal(render('verifying').props.footer, undefined);
  assert.equal(nodes(render('verifying')).filter(node => node.props.accessibilityRole === 'progressbar').length, 0, 'verification has no fabricated progress');
  const bar = nodes(render('downloading')).find(node => node.props.accessibilityRole === 'progressbar');
  assert.equal(bar.props.accessibilityValue.now, 10);
  assert.equal(bar.props.accessibilityValue.max, 100);
  assert.equal(nodes(render('downloading', { totalBytes: 0 })).filter(node => node.props.accessibilityRole === 'progressbar').length, 0);
  const errorMessage = errorCode => nodes(render('failed', { errorCode })).find(node => node.type === 'Notice' && node.props.tone === 'error').props.message;
  const storageFull = errorMessage('model_storage_full');
  assert.equal(errorMessage('model_out_of_space'), storageFull);
  assert.notEqual(errorMessage('model_storage_failed'), storageFull, 'general write failure must not claim insufficient space');
  const service = errorMessage('model_catalog_unavailable');
  for (const code of ['model_catalog_invalid', 'model_insecure_url', 'model_manifest_invalid']) assert.equal(errorMessage(code), service);
  assert.notEqual(service, errorMessage('model_download_failed'), 'server configuration failure must not blame the user connection');
  assert.match(service, locale === 'ko' ? /서비스/ : /service/);
  const wifi = nodes(render('required')).find(node => node.type === 'Notice').props.message;
  assert.match(wifi, locale === 'ko' ? /앱을 열어 두세요/ : /Keep the app open/);
}
const gateExports = {}, gateSlots = [];
let gateState = state('checking'), gateStartupChecked = false, gateIndex = 0, gateEffects = [], splashHides = 0;
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./ModelSetupGate.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, { exports: gateExports, require(name) {
  const modules = {
    react: { ...React, useState(initial) {
      const key = gateIndex++;
      gateSlots[key] ??= typeof initial === 'function' ? initial() : initial;
      return [gateSlots[key], value => { gateSlots[key] = value; }];
    }, useEffect(effect) { gateEffects.push(effect); } },
    'expo-splash-screen': { hide() { splashHides++; } },
    '../services/secure-session': { secureSessionStorage: { getItem: async () => null } },
    './demo-state': { displayLocale: () => 'ko' },
    './controller/useLocalActions': { deviceLocale: () => 'ko' },
    './screens/ModelSetupScreen': { ModelSetupScreen: 'ModelSetupScreen' },
    './useModelAssets': { useModelAssets: () => ({ state: gateState, startupChecked: gateStartupChecked }) },
  };
  assert.ok(name in modules, name); return modules[name];
} });
const app = React.createElement('AppContent');
function gate(status, startupChecked = status !== 'checking') {
  gateState = state(status); gateStartupChecked = startupChecked; gateIndex = 0; gateEffects = [];
  const result = gateExports.ModelSetupGate({ children: app });
  gateEffects.forEach(effect => effect());
  return result;
}
assert.equal(gate('checking'), null, 'local hash check must retain the splash without showing download UI');
assert.equal(splashHides, 0);
assert.equal(gate('ready').props.children, app, 'valid local files enter the app directly');
assert.equal(splashHides, 1);
gateSlots.length = 0; splashHides = 0;
assert.equal(gate('checking'), null);
assert.equal(gate('required').type, 'ModelSetupScreen', 'missing files show download UI after checking');
assert.equal(gate('checking', true).type, 'ModelSetupScreen', 'explicit retry must not return to the startup splash');
assert.equal(gate('failed').type, 'ModelSetupScreen', 'integrity errors expose recovery');
// Run the actual feedback component effects across mounts and status updates.
function feedbackHarness(name, initialReduced = false) {
  const slots = [], springs = [];
  let index = 0, effects = [], reduced = initialReduced;
  const slot = create => slots[index++] ??= create();
  const exports = {};
  const component = readFileSync(new URL(`./components/${name}.tsx`, import.meta.url), 'utf8');
  const modules = {
    react: { ...React,
      useRef: initial => slot(() => ({ current: initial })),
      useEffect(effect, deps) {
        const saved = slot(() => ({}));
        if (!saved.deps || deps.some((value, i) => value !== saved.deps[i])) {
          saved.deps = deps;
          effects.push(() => { saved.cleanup?.(); saved.cleanup = effect(); });
        }
      },
    },
    'react-native': { View: 'View', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    },
    'react-native-reanimated': { default: { View: 'AnimatedView' },
      cancelAnimation() {}, Easing: { linear() {} }, ReduceMotion: { Always: 'always', Never: 'never' },
      useAnimatedStyle: () => ({}),
      useSharedValue: initial => slot(() => {
        let value = initial;
        return { get value() { return value; }, set value(next) {
          if (next?.spring) { springs.push({ from: value, to: next.to }); value = next.to; }
          else value = next;
        } };
      }),
      withSpring: to => ({ spring: true, to }), withTiming: value => value, withRepeat: value => value,
    },
    './motion': { useEntranceProgress: () => ({ progress: { value: 1 }, reduceMotion: reduced }) },
    './AppIcon': { AppIcon: 'AppIcon' }, './SemanticText': { SemanticText: 'SemanticText' },
    '../theme': { theme: { typography: { secondary: {} }, motion: {}, colors: {}, spacing: {}, radii: {} } },
  };
  vm.runInNewContext(ts.transpileModule(component, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText, { exports, require(id) { assert.ok(id in modules, id); return modules[id]; } });
  return {
    render(props) { index = 0; exports[name](props); effects.splice(0).forEach(effect => effect()); },
    get checkPops() { return springs.filter(spring => spring.from === 0.7 && spring.to === 1).length; },
    setReduced(value) { reduced = value; },
    unmount() { slots.forEach(saved => saved.cleanup?.()); },
  };
}
const stepFeedback = feedbackHarness('ProcessingStep');
const renderStep = status => stepFeedback.render({ label: 'Step', status, statusLabel: status });
renderStep('done');
assert.equal(stepFeedback.checkPops, 0, 'an initially completed step must not replay completion');
renderStep('active'); renderStep('done');
assert.equal(stepFeedback.checkPops, 1, 'the actual active-to-done transition pops the check once');
renderStep('done');
assert.equal(stepFeedback.checkPops, 1, 'unchanged done status must not replay completion');
renderStep('active'); renderStep('error');
assert.equal(stepFeedback.checkPops, 1, 'an error must not animate as success');
stepFeedback.setReduced(true); renderStep('done');
stepFeedback.setReduced(false); renderStep('done');
assert.equal(stepFeedback.checkPops, 1, 'reduced completion and re-enabling motion must not replay success');
stepFeedback.unmount();

const successNotice = feedbackHarness('Notice');
successNotice.render({ message: 'Saved', tone: 'success' });
assert.equal(successNotice.checkPops, 1, 'a conditionally mounted explicit success notice pops on arrival');
successNotice.render({ message: 'Saved', tone: 'success' });
successNotice.render({ message: 'Saved record', tone: 'success' });
assert.equal(successNotice.checkPops, 1, 'rerenders and copy changes must not repeat the success check');
successNotice.unmount();
const busyNotice = feedbackHarness('Notice');
busyNotice.render({ message: 'Checking', busy: true });
busyNotice.render({ message: 'Stopped', busy: false });
assert.equal(busyNotice.checkPops, 0, 'busy=false alone is not success');
busyNotice.render({ message: 'Checking', tone: 'success', busy: true });
assert.equal(busyNotice.checkPops, 0, 'busy success tone must still show processing');
busyNotice.render({ message: 'Saved', tone: 'success', busy: false });
assert.equal(busyNotice.checkPops, 1, 'explicit non-busy success triggers its check');
busyNotice.unmount();
const reducedNotice = feedbackHarness('Notice', true);
reducedNotice.render({ message: 'Saved', tone: 'success' });
reducedNotice.setReduced(false);
reducedNotice.render({ message: 'Saved', tone: 'success' });
assert.equal(reducedNotice.checkPops, 0, 'reduced initial success must not animate or replay when motion returns');
reducedNotice.unmount();
console.log('useModelAssets.check passed: local hash-first splash, direct ready entry, download recovery, lifecycle, ko/en UI and real success feedback');
