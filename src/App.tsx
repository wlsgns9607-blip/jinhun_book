import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FieldData, HouseholdState, UserAccount } from './types';

const USERS_KEY = 'household-budget-users-v1';
const ACTIVE_USER_KEY = 'household-budget-active-user-v1';
const LEGACY_STORAGE_KEY = 'household-budget-v1';
const THEME_KEY = 'household-budget-theme';

const DEFAULT_ASSET_KEYS = ['토스', '카카오뱅크', 'KB국민은행', '농협', 'IBK기업은행', '신한은행'];
const MONTHS = ['9월', '10월', '11월', '12월', '1월', '2월'];
const DEFAULT_EXPENSE_CATEGORIES = ['식비', '교통비', '월세', '관리비', '통신비', '생활용품', '문화/취미', '카드결제', '기타'];
const DEFAULT_INCOME_CATEGORIES = ['월급', '훈련/지원금', '계좌이체', '용돈', '부수입', '기타'];
const DEFAULT_INCOME_DESTINATIONS: Record<string, string> = {
  '월급': '토스',
  '훈련/지원금': 'KB국민은행',
  '계좌이체': '토스',
  '용돈': '토스',
  '부수입': '농협',
  '기타': '토스'
};

function field(value: any): FieldData {
  const num = Number(value);
  return { raw: String(value !== undefined && value !== null ? value : 0), value: isNaN(num) ? 0 : num };
}

function buildDefaultState(): HouseholdState {
  const assetKeys = [...DEFAULT_ASSET_KEYS];
  const assets: Record<string, FieldData> = {};
  assetKeys.forEach(k => {
    assets[k] = field(0);
  });
  const expenseCategories = [...DEFAULT_EXPENSE_CATEGORIES];
  const incomeCategories = [...DEFAULT_INCOME_CATEGORIES];
  const incomeDestinations: Record<string, string> = { ...DEFAULT_INCOME_DESTINATIONS };

  const expenses: Record<string, Record<string, FieldData>> = {};
  const income: Record<string, Record<string, FieldData>> = {};
  MONTHS.forEach(m => {
    expenses[m] = {};
    expenseCategories.forEach(c => { expenses[m][c] = field(0); });
    income[m] = {};
    incomeCategories.forEach(c => { income[m][c] = field(0); });
  });

  return {
    assetKeys,
    assets,
    incomeCategories,
    incomeDestinations,
    expenseCategories,
    expenses,
    income,
    activeMonth: MONTHS[0]
  };
}

function getUserStorageKey(userId: string) {
  return `household-budget-user-data-${userId}`;
}

function loadUserState(userId: string): HouseholdState {
  try {
    let raw = localStorage.getItem(getUserStorageKey(userId));
    if (!raw && userId === 'default') {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    }
    if (!raw) return buildDefaultState();
    const parsed = JSON.parse(raw);
    const base = buildDefaultState();

    // 1. 자산 목록 복구
    let keys = parsed.assetKeys;
    if (!Array.isArray(keys)) {
      keys = parsed.assets ? Object.keys(parsed.assets) : DEFAULT_ASSET_KEYS;
    }
    const seenAsset: Record<string, boolean> = {};
    const cleanKeys: string[] = [];
    keys.forEach((k: any) => {
      if (typeof k === 'string' && k.trim() !== '' && !seenAsset[k]) {
        seenAsset[k] = true;
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
        base.assets[k] = field(0);
      }
    });

    // 2. 수입 카테고리 & 입금 은행 목록 복구
    if (Array.isArray(parsed.incomeCategories) && parsed.incomeCategories.length > 0) {
      base.incomeCategories = parsed.incomeCategories;
    }
    if (parsed.incomeDestinations && typeof parsed.incomeDestinations === 'object') {
      base.incomeDestinations = { ...base.incomeDestinations, ...parsed.incomeDestinations };
    }

    // 3. 지출 카테고리 목록 복구
    if (Array.isArray(parsed.expenseCategories) && parsed.expenseCategories.length > 0) {
      base.expenseCategories = parsed.expenseCategories;
    }

    // 4. 월별 데이터 복구
    MONTHS.forEach(m => {
      base.expenseCategories.forEach(c => {
        if (parsed.expenses && parsed.expenses[m] && parsed.expenses[m][c]) {
          base.expenses[m][c] = field(parsed.expenses[m][c].value !== undefined ? parsed.expenses[m][c].value : parsed.expenses[m][c].raw);
          if (parsed.expenses[m][c].raw !== undefined) base.expenses[m][c].raw = String(parsed.expenses[m][c].raw);
        }
      });
      base.incomeCategories.forEach(c => {
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

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `h_${hash.toString(36)}_${str.length}`;
}

function loadUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveUsers(users: UserAccount[]) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (e) {}
}

function evaluateFormula(input: string): number | null {
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

function formatWon(n: number): string {
  if (typeof n !== 'number' || isNaN(n)) n = 0;
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toLocaleString('ko-KR') + '원';
}

function formatWonBig(n: number): string {
  if (typeof n !== 'number' || isNaN(n)) n = 0;
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + '₩' + Math.abs(rounded).toLocaleString('ko-KR');
}

interface MoneyInputProps {
  fieldData: FieldData;
  onChange: (newVal: FieldData) => void;
}

function MoneyInput({ fieldData, onChange }: MoneyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatWon(fieldData ? fieldData.value : 0));
    }
  }, [fieldData, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setInputValue(fieldData ? fieldData.raw : '0');
  };

  const commitValue = (val: string) => {
    const result = evaluateFormula(val === '' ? '0' : val);
    if (result === null) {
      setHasError(true);
      setTimeout(() => setHasError(false), 350);
      setInputValue(formatWon(fieldData ? fieldData.value : 0));
      return;
    }
    onChange({ raw: String(result), value: result });
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (wrapRef.current && wrapRef.current.contains(document.activeElement)) {
        return;
      }
      setIsFocused(false);
      commitValue(inputValue);
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    }
  };

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
    </div>
  );
}


export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });

  const [usersList, setUsersList] = useState<UserAccount[]>(loadUsers);

  // 로그인 폼 상태
  const [nameInput, setNameInput] = useState('');
  const [birthInput, setBirthInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // 가계부 상태
  const [state, setState] = useState<HouseholdState>(() => {
    const active = currentUser ? currentUser.id : 'default';
    return loadUserState(active);
  });

  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light'; }
    catch (e) { return 'light'; }
  });

  // 유저 변경 시 가계부 데이터 로드
  useEffect(() => {
    if (currentUser) {
      setState(loadUserState(currentUser.id));
    }
  }, [currentUser]);

  // 가계부 데이터 자동 저장
  useEffect(() => {
    if (currentUser) {
      try {
        localStorage.setItem(getUserStorageKey(currentUser.id), JSON.stringify(state));
      } catch (e) {}
    }
  }, [state, currentUser]);

  // 테마 적용
  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 로그인/가입 처리
  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const trimmedName = nameInput.trim();
    const cleanBirth = birthInput.trim().replace(/[^0-9]/g, '');
    const trimmedPw = passwordInput.trim();

    if (!trimmedName) {
      setAuthError('이름을 입력해주세요.');
      return;
    }
    if (!cleanBirth || cleanBirth.length < 6) {
      setAuthError('생년월일 6자리(예: 950101)를 정확히 입력해주세요.');
      return;
    }
    if (!trimmedPw) {
      setAuthError('나만의 암호(비밀번호)를 입력해주세요.');
      return;
    }

    const userId = `${trimmedName}_${cleanBirth}`;
    const pwHash = simpleHash(trimmedPw);
    const existingIndex = usersList.findIndex(u => u.id === userId);

    if (existingIndex >= 0) {
      const user = usersList[existingIndex];
      if (user.passwordHash !== pwHash) {
        setAuthError('비밀번호(나만의 암호)가 일치하지 않습니다. 다시 확인해주세요.');
        return;
      }
      const updatedUser: UserAccount = {
        ...user,
        lastLoginAt: Date.now()
      };
      const newUsers = [...usersList];
      newUsers[existingIndex] = updatedUser;
      setUsersList(newUsers);
      saveUsers(newUsers);

      setCurrentUser(updatedUser);
      localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(updatedUser));
      setPasswordInput('');
    } else {
      const newUser: UserAccount = {
        id: userId,
        name: trimmedName,
        birthDate: cleanBirth,
        passwordHash: pwHash,
        createdAt: Date.now(),
        lastLoginAt: Date.now()
      };
      const newUsers = [newUser, ...usersList];
      setUsersList(newUsers);
      saveUsers(newUsers);

      setCurrentUser(newUser);
      localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(newUser));
      setPasswordInput('');
    }
  };

  const handleSelectQuickUser = (user: UserAccount) => {
    setNameInput(user.name);
    setBirthInput(user.birthDate);
    setPasswordInput('');
    setAuthError('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(ACTIVE_USER_KEY);
    setPasswordInput('');
    setAuthError('');
    setAuthSuccess('');
  };

  const handleReset = () => {
    if (window.confirm('현재 사용자의 모든 자산과 지출 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) {
      setState(buildDefaultState());
    }
  };

  // 특정 자산(은행)으로 들어오는 입금 합계 계산
  const incomeSumByAccount = useCallback((month: string, accountName: string) => {
    let sum = 0;
    const monthInc = state.income[month] || {};
    state.incomeCategories.forEach(cat => {
      const dest = state.incomeDestinations[cat] || state.assetKeys[0] || '';
      if (dest === accountName && monthInc[cat]) {
        sum += monthInc[cat].value;
      }
    });
    return sum;
  }, [state.income, state.incomeCategories, state.incomeDestinations, state.assetKeys]);

  const getAssetIncome = useCallback((key: string, month?: string) => {
    const m = month || state.activeMonth;
    return incomeSumByAccount(m, key);
  }, [state.activeMonth, incomeSumByAccount]);

  const getAssetTotalValue = useCallback((key: string, month?: string) => {
    const baseVal = state.assets[key] ? state.assets[key].value : 0;
    return baseVal + getAssetIncome(key, month);
  }, [state.assets, getAssetIncome]);

  const monthExpenseSum = useCallback((m: string) => {
    let sum = 0;
    const exp = state.expenses[m] || {};
    state.expenseCategories.forEach(c => { if (exp[c]) sum += exp[c].value; });
    return sum;
  }, [state.expenses, state.expenseCategories]);

  const monthIncomeSum = useCallback((m: string) => {
    let sum = 0;
    const inc = state.income[m] || {};
    state.incomeCategories.forEach(c => { if (inc[c]) sum += inc[c].value; });
    return sum;
  }, [state.income, state.incomeCategories]);

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

  const remainingMoney = useMemo(() => {
    return baseTotalAssets + totalIncomeAllMonths - totalExpenseAllMonths;
  }, [baseTotalAssets, totalIncomeAllMonths, totalExpenseAllMonths]);

  // 자산 변경 및 추가/삭제
  const handleAssetChange = (key: string, newFieldData: FieldData) => {
    setState(prev => ({
      ...prev,
      assets: { ...prev.assets, [key]: newFieldData }
    }));
  };

  const handleAddAsset = () => {
    const name = prompt('추가할 자산(은행/통장/계좌/자산) 이름을 입력하세요:\n예: IBK기업은행, 농협, 신한은행, 토스, 카카오뱅크');
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

  const handleDeleteAsset = (key: string) => {
    if (state.assetKeys.length <= 1) {
      alert('최소 1개 이상의 자산 항목이 필요합니다.');
      return;
    }
    if (window.confirm(`"${key}" 자산 항목을 삭제하시겠습니까?`)) {
      setState(prev => {
        const nextKeys = prev.assetKeys.filter(k => k !== key);
        const nextAssets = { ...prev.assets };
        delete nextAssets[key];
        // 입금 은행 대상 재조정
        const fallbackDest = nextKeys[0] || '';
        const nextDests = { ...prev.incomeDestinations };
        Object.keys(nextDests).forEach(cat => {
          if (nextDests[cat] === key) {
            nextDests[cat] = fallbackDest;
          }
        });
        return {
          ...prev,
          assetKeys: nextKeys,
          assets: nextAssets,
          incomeDestinations: nextDests
        };
      });
    }
  };

  // 수입 카테고리 & 입금 은행 관리
  const handleAddIncomeCategory = () => {
    const name = prompt('추가할 입금(수입) 항목 이름을 입력하세요:\n예: 알바비, 성과급, 부수입, 정부지원금');
    if (name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (state.incomeCategories.includes(trimmed)) {
        alert('이미 존재하는 입금 항목입니다: ' + trimmed);
        return;
      }
      setState(prev => {
        const nextInc = { ...prev.income };
        MONTHS.forEach(m => {
          nextInc[m] = { ...nextInc[m], [trimmed]: field(0) };
        });
        return {
          ...prev,
          incomeCategories: [...prev.incomeCategories, trimmed],
          incomeDestinations: {
            ...prev.incomeDestinations,
            [trimmed]: prev.assetKeys[0] || '기본통장'
          },
          income: nextInc
        };
      });
    }
  };

  const handleDeleteIncomeCategory = (cat: string) => {
    if (state.incomeCategories.length <= 1) {
      alert('최소 1개 이상의 입금 항목이 필요합니다.');
      return;
    }
    if (window.confirm(`"${cat}" 입금 항목을 삭제하시겠습니까?`)) {
      setState(prev => {
        const nextCats = prev.incomeCategories.filter(c => c !== cat);
        const nextDests = { ...prev.incomeDestinations };
        delete nextDests[cat];
        return {
          ...prev,
          incomeCategories: nextCats,
          incomeDestinations: nextDests
        };
      });
    }
  };

  const handleIncomeDestinationChange = (cat: string, newBank: string) => {
    setState(prev => ({
      ...prev,
      incomeDestinations: {
        ...prev.incomeDestinations,
        [cat]: newBank
      }
    }));
  };

  const handleIncomeChange = (cat: string, newFieldData: FieldData) => {
    const m = state.activeMonth;
    setState(prev => ({
      ...prev,
      income: {
        ...prev.income,
        [m]: { ...prev.income[m], [cat]: newFieldData }
      }
    }));
  };

  // 지출 카테고리 관리
  const handleAddExpenseCategory = () => {
    const name = prompt('추가할 지출 항목 이름을 입력하세요:\n예: 쇼핑, 외식비, 병원비, 보험료');
    if (name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (state.expenseCategories.includes(trimmed)) {
        alert('이미 존재하는 지출 항목입니다: ' + trimmed);
        return;
      }
      setState(prev => {
        const nextExp = { ...prev.expenses };
        MONTHS.forEach(m => {
          nextExp[m] = { ...nextExp[m], [trimmed]: field(0) };
        });
        return {
          ...prev,
          expenseCategories: [...prev.expenseCategories, trimmed],
          expenses: nextExp
        };
      });
    }
  };

  const handleDeleteExpenseCategory = (cat: string) => {
    if (state.expenseCategories.length <= 1) {
      alert('최소 1개 이상의 지출 항목이 필요합니다.');
      return;
    }
    if (window.confirm(`"${cat}" 지출 항목을 삭제하시겠습니까?`)) {
      setState(prev => ({
        ...prev,
        expenseCategories: prev.expenseCategories.filter(c => c !== cat)
      }));
    }
  };

  const handleExpenseChange = (cat: string, newFieldData: FieldData) => {
    const m = state.activeMonth;
    setState(prev => ({
      ...prev,
      expenses: {
        ...prev.expenses,
        [m]: { ...prev.expenses[m], [cat]: newFieldData }
      }
    }));
  };

  // 로그인 화면
  if (!currentUser) {
    return (
      <div className="page auth-page">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">▤</span>
            <h1>스마트 가계부</h1>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={toggleTheme} aria-label="테마 전환">
              {theme === 'dark' ? '☀' : '🌙'}
            </button>
          </div>
        </header>

        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon">🔐</div>
            <h2>간편 로그인 & 회원가입</h2>
            <p>이름, 생년월일, 나만의 비밀번호로 나만의 가계부를 안전하게 시작하세요.</p>
          </div>

          {usersList.length > 0 && (
            <div className="recent-users-section">
              <span className="recent-label">최근 등록된 사용자:</span>
              <div className="recent-users-list">
                {usersList.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    className="user-chip-btn"
                    onClick={() => handleSelectQuickUser(u)}
                  >
                    👤 {u.name} ({u.birthDate.slice(2, 6)})
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="user-name">이름 (실명 또는 닉네임)</label>
              <input
                id="user-name"
                type="text"
                className="auth-input"
                placeholder="예: 홍길동"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="user-birth">생년월일 6자리</label>
              <input
                id="user-birth"
                type="text"
                maxLength={6}
                className="auth-input"
                placeholder="예: 950101 (6자리 숫자)"
                value={birthInput}
                onChange={e => setBirthInput(e.target.value.replace(/[^0-9]/g, ''))}
                autoComplete="bday"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="user-password">나만의 암호 (비밀번호)</label>
              <div className="password-input-wrapper">
                <input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input password-input"
                  placeholder="비밀번호 입력 (화면에 안보임)"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(prev => !prev)}
                  title={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPassword ? '🙈 숨김' : '👁 보기'}
                </button>
              </div>
            </div>

            {authError && <div className="auth-alert error">{authError}</div>}
            {authSuccess && <div className="auth-alert success">{authSuccess}</div>}

            <button type="submit" className="auth-submit-btn">
              로그인 / 가계부 시작하기
            </button>
          </form>

          <div className="auth-guide">
            <p>💡 <strong>처음 오셨나요?</strong> 입력하신 정보로 즉시 새 가계부 계정이 생성됩니다.</p>
            <p>🔒 각 사용자마다 데이터가 독립적으로 안전하게 분리 저장됩니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">▤</span>
          <div>
            <h1>리액트 가계부</h1>
            <div className="user-badge">
              <span className="user-icon">👤</span>
              <strong className="user-name">{currentUser.name}</strong>
              <span className="user-birth">({currentUser.birthDate})</span>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggleTheme} aria-label="테마 전환" title="테마 전환">
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
          <button className="text-btn switch-user-btn" onClick={handleLogout} title="다른 사용자로 로그인">
            사용자 전환 / 로그아웃
          </button>
          <button className="text-btn danger-btn" onClick={handleReset}>초기화</button>
        </div>
      </header>

      {/* Assets Section */}
      <section className="panel asset-panel">
        <div className="panel-head">
          <div className="panel-head-left">
            <h2 className="panel-title asset-title">내 자산 (은행 / 계좌)</h2>
            <span className="panel-subtitle">은행/자산을 자유롭게 추가하고 관리하세요</span>
          </div>
          <button className="sub-btn asset-btn" type="button" onClick={handleAddAsset}>+ 자산/은행 추가</button>
        </div>
        <div className="asset-grid">
          {state.assetKeys.map(key => {
            const incomeAdd = getAssetIncome(key, state.activeMonth);
            return (
              <div className="asset-card" key={key}>
                <div className="asset-card-header">
                  <label title={key} className="asset-label-bold">{key}</label>
                  {incomeAdd > 0 && (
                    <span className="dest-badge auto-badge">
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
                  fieldData={state.assets[key] || field(0)}
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
          <h3 className="hero-label asset-text">총 자산 (기본 자산 + {state.activeMonth} 입금)</h3>
          <span className="hero-value asset-accent">{formatWonBig(totalAssets)}</span>
        </div>
      </section>

      {/* Month Ledger Section */}
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">월별 내역</h2>
          <span className="panel-subtitle">원하는 월을 선택해 수입/지출을 기록하세요</span>
        </div>
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
        <div className="subsection-head">
          <h3 className="subsection-title income-title">
            💰 입금 내역 <small className="sub-caption">(각 항목별 입금 은행 선택 가능)</small>
          </h3>
          <button className="sub-btn income-sub-btn" type="button" onClick={handleAddIncomeCategory}>
            + 입금 항목 추가
          </button>
        </div>
        <div className="ledger">
          <div className="ledger-head">
            <span>입금 항목</span>
            <span>입금 대상 은행</span>
            <span>금액</span>
            <span style={{ width: '28px', textAlign: 'center' }}>삭제</span>
          </div>
          {state.incomeCategories.map(cat => {
            const currentDest = state.incomeDestinations[cat] || state.assetKeys[0] || '';
            return (
              <div className="ledger-row income-ledger-row" key={cat}>
                <div className="cat-label-wrap">
                  <span className="cat-label">{cat}</span>
                </div>
                
                {/* 입금 대상 은행 드롭다운 */}
                <div className="bank-select-wrap">
                  <select
                    className="bank-select"
                    value={currentDest}
                    onChange={(e) => handleIncomeDestinationChange(cat, e.target.value)}
                    title={`${cat}의 입금 은행 선택`}
                  >
                    {state.assetKeys.map(assetKey => (
                      <option key={assetKey} value={assetKey}>
                        🏦 {assetKey}
                      </option>
                    ))}
                  </select>
                </div>

                <MoneyInput
                  fieldData={state.income[state.activeMonth] ? state.income[state.activeMonth][cat] : field(0)}
                  onChange={(newVal) => handleIncomeChange(cat, newVal)}
                />

                <button
                  type="button"
                  className="row-delete-btn"
                  title={`${cat} 삭제`}
                  onClick={() => handleDeleteIncomeCategory(cat)}
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
        <div className="hero-total">
          <h3 className="hero-label income-text"><span>{state.activeMonth}</span> 총수입</h3>
          <span className="hero-value income-accent">{formatWonBig(monthIncomeSum(state.activeMonth))}</span>
        </div>

        {/* Expense Ledger */}
        <div className="subsection-head" style={{ marginTop: '28px' }}>
          <h3 className="subsection-title expense-title">
            💸 지출 내역
          </h3>
          <button className="sub-btn expense-sub-btn" type="button" onClick={handleAddExpenseCategory}>
            + 지출 항목 추가
          </button>
        </div>
        <div className="ledger">
          <div className="ledger-head">
            <span>지출 항목</span>
            <span>금액</span>
            <span style={{ width: '28px', textAlign: 'center' }}>삭제</span>
          </div>
          {state.expenseCategories.map(cat => (
            <div className="ledger-row expense-ledger-row" key={cat}>
              <div className="cat-label">{cat}</div>
              <MoneyInput
                fieldData={state.expenses[state.activeMonth] ? state.expenses[state.activeMonth][cat] : field(0)}
                onChange={(newVal) => handleExpenseChange(cat, newVal)}
              />
              <button
                type="button"
                className="row-delete-btn"
                title={`${cat} 삭제`}
                onClick={() => handleDeleteExpenseCategory(cat)}
              >
                &times;
              </button>
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
        <h2 className="panel-title">요약 & 은행별 현황</h2>
        <div className="summary-grid">
          <div className="summary-row">
            <span>총 자산 ({state.activeMonth} 기준)</span>
            <span className="positive">{formatWonBig(totalAssets)}</span>
          </div>
          <div className="summary-row">
            <span>전체 수입 (9월–2월 누적)</span>
            <span className="positive">{formatWonBig(totalIncomeAllMonths)}</span>
          </div>
          <div className="summary-row">
            <span>전체 지출 (9월–2월 누적)</span>
            <span className="negative">{formatWonBig(totalExpenseAllMonths)}</span>
          </div>
          <div className="summary-row summary-row-main">
            <span>남은 순자산</span>
            <span className={remainingMoney >= 0 ? 'positive' : 'negative'}>
              {formatWonBig(remainingMoney)}
            </span>
          </div>
        </div>

        {/* 내 자산/은행별 자동 연동 잔액 카드 */}
        <h3 className="subsection-title" style={{ marginTop: '16px', marginBottom: '10px' }}>
          🏦 내 은행별 {state.activeMonth} 입금 연동 합계
        </h3>
        <div className="account-callouts">
          {state.assetKeys.map(key => {
            const inc = getAssetIncome(key, state.activeMonth);
            const total = getAssetTotalValue(key, state.activeMonth);
            return (
              <div className="account-callout custom-bank-callout" key={key}>
                <span className="label">
                  <strong>{key}</strong>
                  <small>기초 자산 + 이번 달 입금 {formatWon(inc)}</small>
                </span>
                <span className="value accent">
                  {formatWonBig(total)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <p className="app-footer">
        👤 <strong>{currentUser.name}</strong> 님의 계정으로 안전하게 자동 저장되고 있습니다.
      </p>
    </div>
  );
}


