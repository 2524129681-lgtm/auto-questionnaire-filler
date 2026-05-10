// sojump.com adapter - shares logic with wjx.cn (same platform, different domain)

class SojumpAdapter extends WjxAdapter {
  static matches(url, doc) {
    return /sojump\.com/.test(url) && !/wjx\.cn/.test(url);
  }

  static getPlatformName() {
    return 'sojump';
  }
}

AdapterRegistry.register(SojumpAdapter);
