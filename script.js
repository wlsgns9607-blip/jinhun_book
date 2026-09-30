const { useState, useEffect, useMemo, useCallback, useRef } = React;

const STORAGE_KEY = 'household-budget-v1';
const THEME_KEY = 'household-budget-theme';

const DEFAULT_ASSET_KEYS = ['토스', '카카오뱅크', '세이프뱅크', '주식', 'KB국민은행', '농협'];
const DEFAULT_ASSETS = { '토스': 298000, '카카오뱅크': 0, '세이프뱅크': 5850000, '주식': 1470000, 'KB국민은행': 0, '농협': 0 };
const MONTHS = ['9월', '10월', '11월', '12월', '1월', '2월'];
const CATEGORIES = ['현대카드 할부', '현대카드 결제', '식비', '교통비', '미용비', 'PC방', '취미', '월세', '관리비', '통신비', '생활용품', '기타'];
const INCOME_CATEGORIES = ['월급', '국취제 훈련자금', '토스로 계좌이체', '용돈', '기타'];
const INCOME_DESTINATIONS = {
  '월급': '토스',
  '국취제 훈련자금': 'KB국민은행',
  '토스로 계좌이체': '토스',
  '용돈': '토스',
  '기타': '토스'
};

function field(value) {
  const num = Number(value);
  return { raw: String(value !== undefined && value !== null ? value : 0), value: isNaN(num) ? 0 : num };
}

function buildDefaultState() {
  const assetKeys = [...DEFAULT_ASSET_KEYS];
  const assets = {};
  assetKeys.forEach(k => {
    assets[k] = field(DEFAULT_ASSETS[k] !== undefined ? DEFAULT_ASSETS[k] : 0);
  });
  const expenses = {};
  const income = {};
  MONTHS.forEach(m => {
    expenses[m] = {};
    CATEGORIES.forEach(c => { expenses[m][c] = field(0); });
    income[m] = {};
    INCOME_CATEGORIES.forEach(c => { income[m][c] = field(0); });
  });
  return { assetKeys, assets, expenses, income, activeMonth: MONTHS[0] };
}

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultState();
    const parsed = JSON.parse(raw);
    const base = buildDefaultState();

    let keys = parsed.assetKeys;
    if (!Array.isArray(keys)) {
      keys = parsed.assets ? Object.keys(parsed.assets) : DEFAULT_ASSET_KEYS;
    }
    const seen = {};
    const cleanKeys = [];
    keys.forEach(k => {
      if (typeof k === 'string' && k.trim() !== '' && !seen[k]) {
        seen[k] = true;
        cleanKeys.push(k);
      }
    });
    base.assetKeys = cleanKeys.length > 0 ? cleanKeys : [...DEFAULT_ASSET_KEYS];
    base.assets = {};
    base.assetKeys.forEach(k => {
      if (parsed.assets && parsed.assets[k]) {
        base.assets[k] = field(parsed.assets[k].value !== undefined ? parsed.assets[k].value : parsed.assets[k].raw);
        if (parsed.assets[k].raw !== undefined) base.assets[k].raw = String(parsed.assets[k].raw);
      } else {
        base.assets[k] = field(DEFAULT_ASSETS[k] !== undefined ? DEFAULT_ASSETS[k] : 0);
      }
    });

    if (base.assets['토스'] && (base.assets['토스'].value === 294383 || base.assets['토스'].value === 0)) {
      base.assets['토스'] = field(298000);
    }

    MONTHS.forEach(m => {
      CATEGORIES.forEach(c => {
        if (parsed.expenses && parsed.expenses[m] && parsed.expenses[m][c]) {
          base.expenses[m][c] = field(parsed.expenses[m][c].value !== undefined ? parsed.expenses[m][c].value : parsed.expenses[m][c].raw);
          if (parsed.expenses[m][c].raw !== undefined) base.expenses[m][c].raw = String(parsed.expenses[m][c].raw);
        }
      });
      INCOME_CATEGORIES.forEach(c => {
        if (parsed.income && parsed.income[m] && parsed.income[m][c]) {
          base.income[m][c] = field(parsed.income[m][c].value !== undefined ? parsed.income[m][c].value : parsed.income[m][c].raw);
          if (parsed.income[m][c].raw !== undefined) base.income[m][c].raw = String(parsed.income[m][c].raw);
        }
      });
    });

    if (parsed.activeMonth && MONTHS.includes(parsed.activeMonth)) {
      base.activeMonth = parsed.activeMonth;
    }
    return base;
  } catch (e) {
    return buildDefaultState();
  }
}

function evaluateFormula(input) {
  const trimmed = (input || '').trim().replace(/,/g, '');
  if (trimmed === '') return 0;
  if (!/^[0-9+\-*/().\s]+$/.test(trimmed)) return null;
  if (/[+\-*/.]$/.test(trimmed)) return null;
  try {
    const result = Function('"use strict"; return (' + trimmed + ')')();
    if (typeof result !== 'number' || !isFinite(result) || isNaN(result)) return null;
    return result;
  } catch (e) {
    return null;
  }
}

function formatWon(n) {
  if (typeof n !== 'number' || isNaN(n)) n = 0;
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toLocaleString('ko-KR') + '원';
}

function formatWonBig(n) {
  if (typeof n !== 'number' || isNaN(n)) n = 0;
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + '₩' + Math.abs(rounded).toLocaleString('ko-KR');
}

// ---- React MoneyInput Component ----
function MoneyInput({ fieldData, onChange }) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatWon(fieldData ? fieldData.value : 0));
    }
  }, [fieldData, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setInputValue(fieldData ? fieldData.raw : '0');
  };

  const handleBlur = (e) => {
    setTimeout(() => {
      if (wrapRef.current && wrapRef.current.contains(document.activeElement)) {
        return;
      }
      setIsFocused(false);
      commitValue(inputValue);
    }, 100);
  };

  const commitValue = (val) => {
    const result = evaluateFormula(val === '' ? '0' : val);
    if (result === null) {
      setHasError(true);
      setTimeout(() => setHasError(false), 350);
      setInputValue(formatWon(fieldData ? fieldData.value : 0));
      return;
    }
    onChange({ raw: val === '' ? '0' : val, value: result });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current && inputRef.current.blur();
    }
  };

  const handleQuickOp = (op, e) => {
    e.preventDefault();
    if (op === 'C') {
      setInputValue('');
    } else {
      setInputValue(prev => prev + op);
    }
    inputRef.current && inputRef.current.focus();
  };

  const isFormula = fieldData && /[+\-*/()]/.test(fieldData.raw);

  return (
    <div className={`field-wrap ${isFocused ? 'is-focused' : ''}`} ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        className={`money-input ${hasError ? 'input-error' : ''}`}
        value={inputValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {isFormula && <div className="formula-hint">= {fieldData.raw}</div>}
      {isFocused && (
        <div className="quick-calc-bar">
          {['+', '-', '*', '/', '(', ')', 'C'].map(op => (
            <button
              key={op}
              type="button"
              className="quick-op-btn"
              onMouseDown={(e) => handleQuickOp(op, e)}
              onTouchStart={(e) => handleQuickOp(op, e)}
            >
              {op}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main App Component ----
function App() {
  const [state, setState] = useState(loadInitialState);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light'; }
    catch (e) { return 'light'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }, [state]);

  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleReset = () => {
    if (window.confirm('모든 자산과 지출 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) {
      setState(buildDefaultState());
    }
  };

  // 계좌 키 탐색
  const tossKey = useMemo(() => {
    if (state.assets['토스']) return '토스';
    for (let k of state.assetKeys) {
      if (k.includes('토스')) return k;
    }
    return state.assetKeys[0] || '토스';
  }, [state.assets, state.assetKeys]);

  const kbKey = useMemo(() => {
    if (state.assets['KB국민은행']) return 'KB국민은행';
    if (state.assets['국민은행']) return '국민은행';
    for (let k of state.assetKeys) {
      if (k.includes('국민') || k.includes('KB')) return k;
    }
    return state.assetKeys[0] || 'KB국민은행';
  }, [state.assets, state.assetKeys]);

  // 입금 계산
  const incomeSumByAccount = useCallback((month, account) => {
    let sum = 0;
    const monthInc = state.income[month] || {};
    INCOME_CATEGORIES.forEach(c => {
      const dest = INCOME_DESTINATIONS[c] || '토스';
      if (dest === account && monthInc[c]) {
        sum += monthInc[c].value;
      }
    });
    return sum;
  }, [state.income]);

  const getAssetIncome = useCallback((key, month) => {
    const m = month || state.activeMonth;
    if (key === tossKey) return incomeSumByAccount(m, '토스');
    if (key === kbKey) return incomeSumByAccount(m, 'KB국민은행');
    return 0;
  }, [tossKey, kbKey, state.activeMonth, incomeSumByAccount]);

  const getAssetTotalValue = useCallback((key, month) => {
    const baseVal = state.assets[key] ? state.assets[key].value : 0;
    return baseVal + getAssetIncome(key, month);
  }, [state.assets, getAssetIncome]);

  // 월별 수입 / 지출 합계
  const monthExpenseSum = useCallback((m) => {
    let sum = 0;
    const exp = state.expenses[m] || {};
    CATEGORIES.forEach(c => { if (exp[c]) sum += exp[c].value; });
    return sum;
  }, [state.expenses]);

  const monthIncomeSum = useCallback((m) => {
    let sum = 0;
    const inc = state.income[m] || {};
    INCOME_CATEGORIES.forEach(c => { if (inc[c]) sum += inc[c].value; });
    return sum;
  }, [state.income]);

  // 전체 요약 계산
  const totalAssets = useMemo(() => {
    let sum = 0;
    state.assetKeys.forEach(k => {
      sum += getAssetTotalValue(k, state.activeMonth);
    });
    return sum;
  }, [state.assetKeys, state.activeMonth, getAssetTotalValue]);

  const baseTotalAssets = useMemo(() => {
    let sum = 0;
    state.assetKeys.forEach(k => {
      if (state.assets[k]) sum += state.assets[k].value;
    });
    return sum;
  }, [state.assetKeys, state.assets]);

  const totalExpenseAllMonths = useMemo(() => {
    let sum = 0;
    MONTHS.forEach(m => { sum += monthExpenseSum(m); });
    return sum;
  }, [monthExpenseSum]);

  const totalIncomeAllMonths = useMemo(() => {
    let sum = 0;
    MONTHS.forEach(m => { sum += monthIncomeSum(m); });
    return sum;
  }, [monthIncomeSum]);

  // 남은 금액 = 순수 기본 자산 총합 + 전체 수입 - 전체 지출
  const remainingMoney = useMemo(() => {
    return baseTotalAssets + totalIncomeAllMonths - totalExpenseAllMonths;
  }, [baseTotalAssets, totalIncomeAllMonths, totalExpenseAllMonths]);

  // 예상 잔액
  const tossEstimate = useMemo(() => {
    const total = getAssetTotalValue(tossKey, state.activeMonth);
    return total - monthExpenseSum(state.activeMonth);
  }, [tossKey, state.activeMonth, getAssetTotalValue, monthExpenseSum]);

  const kbEstimate = useMemo(() => {
    return getAssetTotalValue(kbKey, state.activeMonth);
  }, [kbKey, state.activeMonth, getAssetTotalValue]);

  // 자산 변경 핸들러
  const handleAssetChange = (key, newFieldData) => {
    setState(prev => ({
      ...prev,
      assets: { ...prev.assets, [key]: newFieldData }
    }));
  };

  const handleAddAsset = () => {
    const name = prompt('추가할 자산(통장/계좌/자산) 이름을 입력하세요:');
    if (name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (state.assetKeys.includes(trimmed)) {
        alert('이미 존재하는 자산 항목입니다: ' + trimmed);
        return;
      }
      setState(prev => ({
        ...prev,
        assetKeys: [...prev.assetKeys, trimmed],
        assets: { ...prev.assets, [trimmed]: field(0) }
      }));
    }
  };

  const handleDeleteAsset = (key) => {
    if (state.assetKeys.length <= 1) {
      alert('최소 1개 이상의 자산 항목이 필요합니다.');
      return;
    }
    if (window.confirm(`"${key}" 자산 항목을 삭제하시겠습니까?`)) {
      setState(prev => {
        const nextKeys = prev.assetKeys.filter(k => k !== key);
        const nextAssets = { ...prev.assets };
        delete nextAssets[key];
        return { ...prev, assetKeys: nextKeys, assets: nextAssets };
      });
    }
  };

  // 입금/지출 변경 핸들러
  const handleExpenseChange = (cat, newFieldData) => {
    const m = state.activeMonth;
    setState(prev => ({
      ...prev,
      expenses: {
        ...prev.expenses,
        [m]: { ...prev.expenses[m], [cat]: newFieldData }
      }
    }));
  };

  const handleIncomeChange = (cat, newFieldData) => {
    const m = state.activeMonth;
    setState(prev => ({
      ...prev,
      income: {
        ...prev.income,
        [m]: { ...prev.income[m], [cat]: newFieldData }
      }
    }));
  };

  return (
    <div className="page">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">▤</span>
          <h1>리액트 가계부</h1>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggleTheme} aria-label="테마 전환">
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
          <button className="text-btn" onClick={handleReset}>초기화</button>
        </div>
      </header>

      {/* Assets Section */}
      <section className="panel asset-panel">
        <div className="panel-head">
          <h2 className="panel-title asset-title">내 자산</h2>
          <button className="sub-btn asset-btn" type="button" onClick={handleAddAsset}>+ 자산 추가</button>
        </div>
        <div className="asset-grid">
          {state.assetKeys.map(key => {
            const incomeAdd = getAssetIncome(key, state.activeMonth);
            return (
              <div className="asset-card" key={key}>
                <div className="asset-card-header">
                  <label title={key}>{key}</label>
                  {incomeAdd > 0 && (
                    <span className={`dest-badge ${key === kbKey ? 'kb' : 'toss'}`}>
                      +입금 {formatWon(incomeAdd)}
                    </span>
                  )}
                  <button
                    className="asset-delete-btn"
                    type="button"
                    title={`${key} 삭제`}
                    onClick={() => handleDeleteAsset(key)}
                  >
                    &minus;
                  </button>
                </div>
                <MoneyInput
                  fieldData={state.assets[key]}
                  onChange={(newVal) => handleAssetChange(key, newVal)}
                />
                {incomeAdd > 0 && (
                  <div className="asset-sum-hint">
                    합계 {formatWon(getAssetTotalValue(key, state.activeMonth))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="hero-total">
          <h3 className="hero-label asset-text">총 자산</h3>
          <span className="hero-value asset-accent">{formatWonBig(totalAssets)}</span>
        </div>
      </section>

      {/* Month Ledger Section */}
      <section className="panel">
        <h2 className="panel-title">월별 내역</h2>
        <div className="month-tabs">
          {MONTHS.map(m => (
            <button
              key={m}
              className={`month-tab ${m === state.activeMonth ? 'active' : ''}`}
              onClick={() => setState(prev => ({ ...prev, activeMonth: m }))}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Income Ledger */}
        <h3 className="subsection-title income-title">입금 내역</h3>
        <div className="ledger">
          <div className="ledger-head"><span>항목</span><span>금액</span></div>
          {INCOME_CATEGORIES.map(cat => {
            const dest = INCOME_DESTINATIONS[cat] || '토스';
            return (
              <div className="ledger-row" key={cat}>
                <div className="cat-label-wrap">
                  <span className="cat-label">{cat}</span>
                  <span className={`dest-badge ${dest === 'KB국민은행' ? 'kb' : 'toss'}`}>
                    {dest} 입금
                  </span>
                </div>
                <MoneyInput
                  fieldData={state.income[state.activeMonth] ? state.income[state.activeMonth][cat] : field(0)}
                  onChange={(newVal) => handleIncomeChange(cat, newVal)}
                />
              </div>
            );
          })}
        </div>
        <div className="hero-total">
          <h3 className="hero-label income-text"><span>{state.activeMonth}</span> 총수입</h3>
          <span className="hero-value income-accent">{formatWonBig(monthIncomeSum(state.activeMonth))}</span>
        </div>

        {/* Expense Ledger */}
        <h3 className="subsection-title expense-title">
          지출 내역 <small className="sub-caption">(토스 출금)</small>
        </h3>
        <div className="ledger">
          <div className="ledger-head"><span>항목</span><span>금액</span></div>
          {CATEGORIES.map(cat => (
            <div className="ledger-row" key={cat}>
              <div className="cat-label">{cat}</div>
              <MoneyInput
                fieldData={state.expenses[state.activeMonth] ? state.expenses[state.activeMonth][cat] : field(0)}
                onChange={(newVal) => handleExpenseChange(cat, newVal)}
              />
            </div>
          ))}
        </div>
        <div className="hero-total">
          <h3 className="hero-label expense-text"><span>{state.activeMonth}</span> 총지출</h3>
          <span className="hero-value expense-accent">{formatWonBig(monthExpenseSum(state.activeMonth))}</span>
        </div>
      </section>

      {/* Summary Section */}
      <section className="panel">
        <h2 className="panel-title">요약</h2>
        <div className="summary-grid">
          <div className="summary-row">
            <span>총 자산</span>
            <span className="positive">{formatWonBig(totalAssets)}</span>
          </div>
          <div className="summary-row">
            <span>전체 수입 (9월–2월)</span>
            <span className="positive">{formatWonBig(totalIncomeAllMonths)}</span>
          </div>
          <div className="summary-row">
            <span>전체 지출 (9월–2월)</span>
            <span className="negative">{formatWonBig(totalExpenseAllMonths)}</span>
          </div>
          <div className="summary-row summary-row-main">
            <span>남은 금액</span>
            <span className={remainingMoney >= 0 ? 'positive' : 'negative'}>
              {formatWonBig(remainingMoney)}
            </span>
          </div>
        </div>
        <div className="account-callouts">
          <div className="account-callout toss-callout">
            <span className="label">
              토스 예상 잔액
              <small>토스 입금(월급 등 자동 연동) − 이번 달 지출</small>
            </span>
            <span className={`value ${tossEstimate >= 0 ? 'accent' : 'negative'}`}>
              {formatWonBig(tossEstimate)}
            </span>
          </div>
          <div className="account-callout kb-callout">
            <span className="label">
              KB국민은행 잔액
              <small>국취제 훈련자금 입금 자동 연동</small>
            </span>
            <span className={`value ${kbEstimate >= 0 ? 'accent' : 'negative'}`}>
              {formatWonBig(kbEstimate)}
            </span>
          </div>
        </div>
      </section>

      <p class="app-footer">
        숫자나 100000+50000-20000 같은 계산식을 입력하고 Enter나 다른 칸을 클릭하면 자동으로 반영돼요. 입력한 내용은 이 브라우저에 저장됩니다.
      </p>
    </div>
  );
}

// Render React App
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
