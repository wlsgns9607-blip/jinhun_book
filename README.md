# 리액트 가계부 (React Account Book)

내 자산과 월별 지출/입금을 한 화면에서 관리하고, 금액을 입력하면 총 자산·월별 총지출·총수입·남은 금액이 자동으로 계산되는 리액트(React 18) 기반 가계부입니다.

---

## 📁 파일 구성 (4개 파일 유지)

```
index.html   React 18 & Babel CDN 로드, 루트 HTML
style.css    테마(라이트/다크), 모바일 반응형, 퀵 연산자 패널 디자인
script.js    React 18 컴포넌트 (useState, useEffect, useMemo 기반 가계부 앱)
README.md    사용법 및 SQL 연동 코드 가이드
```

> **규칙 준수**: 기존 프로젝트의 파일 개수(4개)와 파일명을 그대로 유지하며 제작되었습니다.

---

## 🚀 실행 방법

1. `index.html` 파일을 더블클릭하여 인터넷 브라우저(Chrome, Edge, Safari 등)로 엽니다.
2. React 18 및 Babel CDN을 통해 별도의 Node.js 설치나 빌드 과정 없이 즉시 실행됩니다.

---

## ✨ 주요 기능

1. **리액트(React 18) 상태 관리**:
   - `useState`, `useMemo`, `useCallback` 기반의 빠르고 유기적인 실시간 계산.
2. **수식 계산 지원 & 퀵 연산자 패널**:
   - 금액 입력란에 `100000+50000-20000` 같은 엑셀식 사칙연산 입력 가능.
   - 입력창 클릭 시 하단에 `+`, `-`, `*`, `/`, `(`, `)`, `C` 퀵 연산자 버튼이 표시되어 터치로 빠르게 입력 가능.
3. **자산 실시간 입금 연동**:
   - 입금 내역에 수입을 입력하면 지정된 자산 계좌(예: 토스, KB국민은행)의 잔액에 **실시간으로 입금액이 누적 합산**됩니다.
4. **정확한 요약 계산**:
   - 남은 금액 = `순수 기본 자산 총합 + 전체 수입(9월~2월) − 전체 지출(9월~2월)`
5. **다크 모드 & 자동 저장**:
   - 우측 상단 🌙/☀ 버튼으로 라이트/다크 테마 지원.
   - 입력 데이터는 브라우저 `localStorage`에 자동 저장됩니다.

---

## 🗄️ SQL database 스키마 및 쿼리 코드 (RDBMS / MySQL / PostgreSQL / SQLite)

백엔드 DB 연동 시 사용할 수 있는 SQL 스키마 DDL 및 주요 집계 쿼리 예시입니다.

### 1. 테이블 생성 DDL (CREATE TABLE)

```sql
-- 1) 자산 목록 테이블 (Assets)
CREATE TABLE assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_name VARCHAR(50) NOT NULL UNIQUE, -- 예: 토스, KB국민은행, 주식 등
    base_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- 기본 잔액
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2) 입금 내역 테이블 (Income Records)
CREATE TABLE income_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    target_month VARCHAR(10) NOT NULL, -- 예: '9월', '10월' ...
    category_name VARCHAR(50) NOT NULL, -- 예: '월급', '국취제 훈련자금'
    destination_account VARCHAR(50) NOT NULL DEFAULT '토스', -- 입금 계좌 ('토스', 'KB국민은행')
    raw_formula VARCHAR(255) DEFAULT '0', -- 입력한 수식 문자열
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- 계산된 최종 금액
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3) 지출 내역 테이블 (Expense Records)
CREATE TABLE expense_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    target_month VARCHAR(10) NOT NULL, -- 예: '9월', '10월' ...
    category_name VARCHAR(50) NOT NULL, -- 예: '식비', '월세', '현대카드 결제' 등
    source_account VARCHAR(50) NOT NULL DEFAULT '토스', -- 출금 계좌
    raw_formula VARCHAR(255) DEFAULT '0', -- 입력 수식
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- 지출 금액
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 초기 자산 기본 데이터 삽입
INSERT INTO assets (asset_name, base_balance) VALUES
('토스', 298000),
('카카오뱅크', 0),
('세이프뱅크', 5850000),
('주식', 1470000),
('KB국민은행', 0),
('농협', 0);
```

---

### 2. 주요 조회 및 집계 SQL 쿼리 (SELECT)

#### ① 이번 달 자산별 입금 누적액 합계 조회
```sql
-- 특정 월(예: '9월')의 계좌별 입금 합계
SELECT 
    destination_account AS account_name,
    SUM(amount) AS monthly_income
FROM income_records
WHERE target_month = '9월'
GROUP BY destination_account;
```

#### ② 이번 달 총수입 & 총지출 조회
```sql
-- 선택한 달('9월')의 총수입
SELECT SUM(amount) AS total_income
FROM income_records
WHERE target_month = '9월';

-- 선택한 달('9월')의 총지출
SELECT SUM(amount) AS total_expense
FROM expense_records
WHERE target_month = '9월';
```

#### ③ 토스 예상 잔액 계산 쿼리
```sql
-- 토스 기본자산 + 9월 토스 입금 총합 - 9월 토스 출금(총지출)
SELECT 
    (COALESCE(a.base_balance, 0) + COALESCE(inc.total_inc, 0) - COALESCE(exp.total_exp, 0)) AS toss_estimated_balance
FROM assets a
LEFT JOIN (
    SELECT destination_account, SUM(amount) AS total_inc
    FROM income_records
    WHERE target_month = '9월' AND destination_account = '토스'
    GROUP BY destination_account
) inc ON a.asset_name = inc.destination_account
LEFT JOIN (
    SELECT source_account, SUM(amount) AS total_exp
    FROM expense_records
    WHERE target_month = '9월'
    GROUP BY source_account
) exp ON a.asset_name = exp.source_account
WHERE a.asset_name = '토스';
```

#### ④ 전체 요약 (총 자산 + 전체 수입 - 전체 지출 = 남은 금액)
```sql
SELECT 
    base_assets.total_base AS base_assets_total,
    COALESCE(all_inc.total_income, 0) AS total_income_all,
    COALESCE(all_exp.total_expense, 0) AS total_expense_all,
    (base_assets.total_base + COALESCE(all_inc.total_income, 0) - COALESCE(all_exp.total_expense, 0)) AS final_remaining_balance
FROM 
    (SELECT SUM(base_balance) AS total_base FROM assets) base_assets,
    (SELECT SUM(amount) AS total_income FROM income_records) all_inc,
    (SELECT SUM(amount) AS total_expense FROM expense_records) all_exp;
```

---

### 3. 데이터 추가 및 수정 쿼리 (INSERT / UPDATE / UPSERT)

```sql
-- 입금 내역 저장 (UPSERT)
INSERT INTO income_records (target_month, category_name, destination_account, raw_formula, amount)
VALUES ('9월', '월급', '토스', '2500000+100000', 2600000)
ON DUPLICATE KEY UPDATE 
raw_formula = VALUES(raw_formula),
amount = VALUES(amount);

-- 지출 내역 저장 (UPSERT)
INSERT INTO expense_records (target_month, category_name, source_account, raw_formula, amount)
VALUES ('9월', '식비', '토스', '15000*3', 45000)
ON DUPLICATE KEY UPDATE 
raw_formula = VALUES(raw_formula),
amount = VALUES(amount);
```
