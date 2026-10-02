# -*- coding: utf-8 -*-
"""
파일명: db.py
설명: wlsgns9607-blipjinhun_book0723 가계부 데이터베이스 백엔드 서버 (SQLite3 + REST API)
작성자: Antigravity Assistant
"""

import json
import sqlite3
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

DB_FILE = 'account_book.db'
PORT = 5000


def init_db():
    """SQLite 데이터베이스 및 테이블 초기화"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 유저 계정 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            birth_date TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at REAL,
            last_login_at REAL
        )
    ''')

    # 유저별 가계부 데이터 저장 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_data (
            user_id TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at REAL
        )
    ''')

    conn.commit()
    conn.close()
    print(f"[DB] SQLite 데이터베이스 '{DB_FILE}'가 정상 초기화되었습니다.")


def get_db():
    return sqlite3.connect(DB_FILE)


class RequestHandler(BaseHTTPRequestHandler):

    def _set_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == '/api/health':
            self._response_json({'status': 'ok', 'message': 'SQLite DB Backend is running!'})

        elif parsed.path == '/api/users':
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('SELECT id, name, birth_date, password_hash, created_at, last_login_at FROM users')
            rows = cursor.fetchall()
            conn.close()
            users = [
                {
                    'id': r[0],
                    'name': r[1],
                    'birthDate': r[2],
                    'passwordHash': r[3],
                    'createdAt': r[4],
                    'lastLoginAt': r[5]
                }
                for r in rows
            ]
            self._response_json(users)

        elif parsed.path == '/api/load':
            user_id = params.get('userId', [None])[0]
            if not user_id:
                self._response_json({'error': 'userId required'}, status=400)
                return
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('SELECT state_json FROM user_data WHERE user_id = ?', (user_id,))
            row = cursor.fetchone()
            conn.close()
            if row and row[0]:
                try:
                    data = json.loads(row[0])
                    self._response_json({'userId': user_id, 'state': data})
                except Exception as e:
                    self._response_json({'error': str(e)}, status=500)
            else:
                self._response_json({'userId': user_id, 'state': None})

        else:
            self._response_json({'error': 'Not Found'}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        content_len = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_len).decode('utf-8')

        try:
            payload = json.loads(post_body) if post_body else {}
        except Exception:
            payload = {}

        if parsed.path == '/api/save':
            user_id = payload.get('userId')
            state = payload.get('state')
            if not user_id or state is None:
                self._response_json({'error': 'userId and state required'}, status=400)
                return
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_data (user_id, state_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = excluded.updated_at
            ''', (user_id, json.dumps(state, ensure_ascii=False), time.time()))
            conn.commit()
            conn.close()
            print(f"[DB 저장 성공] 유저 '{user_id}' 데이터가 SQLite DB(db.py)에 안전하게 저장되었습니다.")
            self._response_json({'success': True, 'message': f"User '{user_id}' data saved to DB."})

        elif parsed.path == '/api/users/save':
            users = payload.get('users', [])
            conn = get_db()
            cursor = conn.cursor()
            for u in users:
                cursor.execute('''
                    INSERT INTO users (id, name, birth_date, password_hash, created_at, last_login_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        birth_date = excluded.birth_date,
                        password_hash = excluded.password_hash,
                        last_login_at = excluded.last_login_at
                ''', (
                    u.get('id'),
                    u.get('name'),
                    u.get('birthDate'),
                    u.get('passwordHash'),
                    u.get('createdAt'),
                    u.get('lastLoginAt')
                ))
            conn.commit()
            conn.close()
            self._response_json({'success': True, 'count': len(users)})

        else:
            self._response_json({'error': 'Not Found'}, status=404)

    def _response_json(self, data, status=200):
        self.send_response(status)
        self._set_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def log_message(self, format, *args):
        # HTTP 요청 로그 간소화 출력
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))


if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run_server():
    init_db()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, RequestHandler)
    print("=======================================================================")
    print(f"[가계부 DB 백엔드 서버] http://localhost:{PORT} 에서 실행 중입니다.")
    print(f"[DB 파일] {DB_FILE} (SQLite3 기반 유저 로그인 및 가계부 데이터 동기화)")
    print("=======================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[DB] 서버를 종료합니다.")
        httpd.server_close()


if __name__ == '__main__':
    run_server()
