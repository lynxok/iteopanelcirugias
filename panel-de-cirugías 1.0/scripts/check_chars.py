import sys

def check_file(filepath):
    print(f"Checking {filepath}...")
    with open(filepath, 'rb') as f:
        content = f.read()
    
    for i, byte in enumerate(content):
        if byte > 127:
            # Found non-ASCII
            context = content[max(0, i-20):min(len(content), i+20)]
            print(f"Non-ASCII byte {hex(byte)} at offset {i}: context: {context}")

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        check_file(arg)
