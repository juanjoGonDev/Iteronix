import { emptyLabel, storageKeys } from "../shared/constants.js";
import {
  isHTMLInputElement,
  isHTMLElement,
  selectElement
} from "../shared/dom.js";
import { getStoredValue, setStoredValue } from "../shared/storage.js";
import type { Store } from "../shared/store.js";

type ConnectionContext = {
  root: ParentNode;
  baseUrlStore: Store<string>;
  tokenStore: Store<string>;
};

export const initConnectionScreen = (context: ConnectionContext): void => {
  const baseUrlInput = selectElement(
    context.root,
    "[data-base-url]",
    isHTMLInputElement
  );
  const tokenInput = selectElement(
    context.root,
    "[data-auth-token]",
    isHTMLInputElement
  );
  const targetDisplay = selectElement(
    context.root,
    "[data-current-target]",
    isHTMLElement
  );
  const baseUrl = getStoredValue(storageKeys.baseUrl, "");
  const token = getStoredValue(storageKeys.token, "");
  if (baseUrlInput) {
    baseUrlInput.value = baseUrl;
  }
  if (tokenInput) {
    tokenInput.value = token;
  }
  context.baseUrlStore.set(baseUrl);
  context.tokenStore.set(token);
  context.baseUrlStore.subscribe((value) => {
    if (targetDisplay) {
      targetDisplay.textContent = value === "" ? emptyLabel : value;
    }
  });
  if (baseUrlInput) {
    baseUrlInput.addEventListener("input", () => {
      const value = baseUrlInput.value.trim();
      setStoredValue(storageKeys.baseUrl, value);
      context.baseUrlStore.set(value);
    });
  }
  if (tokenInput) {
    tokenInput.addEventListener("input", () => {
      const value = tokenInput.value.trim();
      setStoredValue(storageKeys.token, value);
      context.tokenStore.set(value);
    });
  }
};
