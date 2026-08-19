let collectRunning = false;
let loginRunning = false;

export function setCollectJobRunning(value: boolean): void {
  collectRunning = value;
}

export function setLoginJobRunning(value: boolean): void {
  loginRunning = value;
}

export function isCollectJobRunning(): boolean {
  return collectRunning;
}

export function isLoginJobRunning(): boolean {
  return loginRunning;
}
