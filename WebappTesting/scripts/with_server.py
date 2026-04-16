import argparse
import subprocess
import time
import socket
import sys
import os
import signal
from typing import List, Tuple

def is_port_open(port: int, host: str = 'localhost') -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0

def wait_for_port(port: int, timeout: int = 60):
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_open(port):
            return True
        time.sleep(1)
    return False

def run_servers(servers: List[Tuple[str, int]]) -> List[subprocess.Popen]:
    processes = []
    for cmd, port in servers:
        print(f"Starting server: {cmd} on port {port}")
        # Use shell=True for complex commands like 'npm run dev'
        p = subprocess.Popen(cmd, shell=True, preexec_fn=os.setsid if os.name != 'nt' else None)
        processes.append(p)
        if not wait_for_port(port):
            print(f"Error: Timeout waiting for port {port}")
            stop_servers(processes)
            sys.exit(1)
    return processes

def stop_servers(processes: List[subprocess.Popen]):
    for p in processes:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)

def main():
    parser = argparse.ArgumentParser(description="Manage server lifecycle for automation tests.")
    parser.add_argument("--server", action="append", help="Server command and port in format 'command:port'", required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER, help="The command to run after servers are ready")

    args = parser.parse_args()

    server_configs = []
    for s in args.server:
        if ':' not in s:
            print(f"Error: Server must be in format 'command:port', got '{s}'")
            sys.exit(1)
        cmd, port = s.rsplit(':', 1)
        server_configs.append((cmd, int(port)))

    processes = run_servers(server_configs)

    try:
        if args.command:
            print(f"Running command: {' '.join(args.command)}")
            subprocess.run(' '.join(args.command), shell=True)
    finally:
        print("Stopping servers...")
        stop_servers(processes)

if __name__ == "__main__":
    main()
