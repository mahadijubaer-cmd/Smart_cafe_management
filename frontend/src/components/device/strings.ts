/**
 * Bilingual UI-chrome strings for device surfaces (kiosk + signage).
 * RFC-010: only chrome is translated (EN/BN) — menu content stays as
 * admin-entered. ISO 9241-112 suitability; no i18n library on purpose,
 * keeping a future full-localization lift tractable (see RFC-010 §3).
 */
export type DeviceLang = 'en' | 'bn'

export const DEVICE_STRINGS = {
  en: {
    // Pairing
    pairTitle: 'Pair this device',
    pairSubtitle: 'Ask a manager for a pairing code from the admin Devices page',
    pairSubmit: 'Pair device',
    pairInvalid: 'Invalid or expired pairing code',
    pairTooMany: 'Too many attempts — please wait a minute',
    pairing: 'Pairing…',
    // Attract
    touchToStart: 'Touch to start',
    welcomeDefault: 'Welcome — order here',
    // Browse / cart
    featured: 'Featured',
    addToOrder: 'Add to order',
    yourOrder: 'Your order',
    emptyCart: 'Your order is empty',
    quantity: 'Quantity',
    notes: 'Special instructions (optional)',
    remove: 'Remove',
    subtotal: 'Subtotal',
    total: 'Total',
    checkout: 'Review order',
    placeOrder: 'Place order',
    placingOrder: 'Placing order…',
    yourName: 'Your name (optional)',
    payAtCounter: 'Pay at the counter when you collect your order',
    // Confirmation
    orderPlaced: 'Order placed!',
    yourNumber: 'Your pickup number',
    collectInstructions: 'Pay at the counter — we will call your number when it is ready',
    startNewOrder: 'Start new order',
    // Idle (WCAG 2.2.1)
    stillThereTitle: 'Are you still there?',
    stillThereBody: 'This order will reset in {seconds} seconds',
    stillHere: "I'm still here",
    // Accessibility / language
    accessibility: 'Accessibility',
    largeText: 'Large text',
    highContrast: 'High contrast',
    language: 'বাংলা',
    back: 'Back',
    cancel: 'Cancel',
    allergens: 'Allergens',
    // Signage
    preparing: 'Preparing',
    ready: 'Ready',
    trendingTitle: 'Most popular right now',
    offersTitle: "Today's offers",
    noContent: 'No content assigned to this display',
    reconnecting: 'Reconnecting…',
  },
  bn: {
    pairTitle: 'এই ডিভাইসটি পেয়ার করুন',
    pairSubtitle: 'অ্যাডমিন ডিভাইস পেজ থেকে ম্যানেজারের কাছে পেয়ারিং কোড চান',
    pairSubmit: 'ডিভাইস পেয়ার করুন',
    pairInvalid: 'ভুল বা মেয়াদোত্তীর্ণ পেয়ারিং কোড',
    pairTooMany: 'অনেকবার চেষ্টা হয়েছে — এক মিনিট অপেক্ষা করুন',
    pairing: 'পেয়ার হচ্ছে…',
    touchToStart: 'শুরু করতে স্পর্শ করুন',
    welcomeDefault: 'স্বাগতম — এখানে অর্ডার করুন',
    featured: 'বিশেষ আইটেম',
    addToOrder: 'অর্ডারে যোগ করুন',
    yourOrder: 'আপনার অর্ডার',
    emptyCart: 'আপনার অর্ডার খালি',
    quantity: 'পরিমাণ',
    notes: 'বিশেষ নির্দেশনা (ঐচ্ছিক)',
    remove: 'বাদ দিন',
    subtotal: 'উপমোট',
    total: 'মোট',
    checkout: 'অর্ডার দেখুন',
    placeOrder: 'অর্ডার করুন',
    placingOrder: 'অর্ডার হচ্ছে…',
    yourName: 'আপনার নাম (ঐচ্ছিক)',
    payAtCounter: 'অর্ডার নেওয়ার সময় কাউন্টারে টাকা দিন',
    orderPlaced: 'অর্ডার সম্পন্ন!',
    yourNumber: 'আপনার পিকআপ নম্বর',
    collectInstructions: 'কাউন্টারে টাকা দিন — প্রস্তুত হলে আপনার নম্বর ডাকা হবে',
    startNewOrder: 'নতুন অর্ডার শুরু করুন',
    stillThereTitle: 'আপনি কি এখনও আছেন?',
    stillThereBody: 'এই অর্ডারটি {seconds} সেকেন্ডে রিসেট হবে',
    stillHere: 'আমি এখানে আছি',
    accessibility: 'সহায়ক সুবিধা',
    largeText: 'বড় লেখা',
    highContrast: 'উচ্চ কনট্রাস্ট',
    language: 'English',
    back: 'পেছনে',
    cancel: 'বাতিল',
    allergens: 'অ্যালার্জেন',
    preparing: 'প্রস্তুত হচ্ছে',
    ready: 'প্রস্তুত',
    trendingTitle: 'এখন সবচেয়ে জনপ্রিয়',
    offersTitle: 'আজকের অফার',
    noContent: 'এই ডিসপ্লেতে কোনো কনটেন্ট নেই',
    reconnecting: 'পুনরায় সংযোগ হচ্ছে…',
  },
} as const

export type DeviceStringKey = keyof (typeof DEVICE_STRINGS)['en']

export function t(lang: DeviceLang, key: DeviceStringKey, vars?: Record<string, string | number>): string {
  let s: string = DEVICE_STRINGS[lang][key] ?? DEVICE_STRINGS.en[key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  }
  return s
}

/** EU FIC 1169/2011 allergen display names (BR-MENU-4). Icon+text, never icon-only. */
export const ALLERGEN_LABELS: Record<string, { en: string; bn: string; icon: string }> = {
  gluten: { en: 'Gluten', bn: 'গ্লুটেন', icon: '🌾' },
  crustaceans: { en: 'Crustaceans', bn: 'ক্রাস্টেশিয়ান', icon: '🦐' },
  eggs: { en: 'Eggs', bn: 'ডিম', icon: '🥚' },
  fish: { en: 'Fish', bn: 'মাছ', icon: '🐟' },
  peanuts: { en: 'Peanuts', bn: 'চিনাবাদাম', icon: '🥜' },
  soybeans: { en: 'Soybeans', bn: 'সয়াবিন', icon: '🫘' },
  milk: { en: 'Milk', bn: 'দুধ', icon: '🥛' },
  nuts: { en: 'Tree nuts', bn: 'বাদাম', icon: '🌰' },
  celery: { en: 'Celery', bn: 'সেলারি', icon: '🥬' },
  mustard: { en: 'Mustard', bn: 'সরিষা', icon: '🟡' },
  sesame: { en: 'Sesame', bn: 'তিল', icon: '⚪' },
  sulphites: { en: 'Sulphites', bn: 'সালফাইট', icon: '🧪' },
  lupin: { en: 'Lupin', bn: 'লুপিন', icon: '🌸' },
  molluscs: { en: 'Molluscs', bn: 'শামুক জাতীয়', icon: '🐚' },
}

export const DIETARY_LABELS: Record<string, { en: string; bn: string; icon: string }> = {
  vegetarian: { en: 'Vegetarian', bn: 'নিরামিষ', icon: '🥗' },
  vegan: { en: 'Vegan', bn: 'ভেগান', icon: '🌱' },
  halal: { en: 'Halal', bn: 'হালাল', icon: '☪️' },
  spicy: { en: 'Spicy', bn: 'ঝাল', icon: '🌶️' },
}
