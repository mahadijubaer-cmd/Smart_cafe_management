import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  QrCode,
  UserRound,
  Building2,
  UtensilsCrossed,
  Store,
  Sparkles,
  ShieldCheck,
  ChefHat,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import GuideJumpNav from '@/components/guide/GuideJumpNav'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
      {children}
    </div>
  )
}

function RoleSection({
  id,
  icon: Icon,
  title,
  summary,
  flowTitle,
  steps,
  checklist,
  gotchas,
}: {
  id: string
  icon: typeof QrCode
  title: string
  summary: string
  flowTitle: string
  steps: string[]
  checklist: string[]
  gotchas: string[]
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-12 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-6" />
        </span>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      </div>

      <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{summary}</p>

      <h3 className="mt-8 text-lg font-semibold">{flowTitle}</h3>
      <ol className="mt-3 max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground/90">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      <h3 className="mt-8 text-lg font-semibold">Everything else you can do</h3>
      <ul className="mt-3 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-6 text-foreground/90">
        {checklist.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      {gotchas.length > 0 && (
        <div className="mt-6 flex max-w-3xl flex-col gap-3">
          {gotchas.map((g, i) => (
            <Callout key={i}>{g}</Callout>
          ))}
        </div>
      )}
    </section>
  )
}

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      {/* Hero */}
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">User Guide</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">
          Everything you need to know about SCMS
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          SCMS is a platform that runs ordering, payments, and day-to-day operations for
          cafeterias, restaurants, franchises, and food courts. Whoever you are — a diner, a
          student, a business owner, or staff — find your situation below for plain-language,
          step-by-step instructions.
        </p>
      </div>

      {/* Jump-nav */}
      <GuideJumpNav />

      {/* Role sections */}
      <div className="mt-14">
        <RoleSection
          id="guest"
          icon={QrCode}
          title="Walk-in Guest — Ordering Without an Account"
          summary="If you're dining at a restaurant, a franchise outlet, or a food court on SCMS, you never need to create an account. Just scan the QR code on your table."
          flowTitle="How to order"
          steps={[
            "Scan the QR code on your table with your phone's camera — no app to download.",
            'Browse the menu that opens in your browser: photos, prices, and allergen/dietary info for every dish.',
            'Add items to your cart. At a food court, you can order from several different stalls in the same cart.',
            'Tap Checkout, then enter just your name and phone number — no password, no email, no account.',
            'Tap "Place order." You\'ll get a tracking link and an on-screen QR code — save or screenshot it, since it\'s the only way to check your order later.',
            'Watch your order move through Confirmed → Preparing → Ready → Delivered on the tracking page — it updates by itself, no need to refresh.',
            'Pay at the counter when your food arrives, unless the venue offers "pay online" at checkout instead.',
          ]}
          checklist={[
            'Order from multiple stalls in one visit at a food court — the kitchen handles it as separate tickets automatically',
            "Use a self-service kiosk terminal in-venue instead of a table QR — you'll get a pickup number instead of a table number",
            'Watch your order status update live without ever refreshing the page',
          ]}
          gotchas={[
            "Your tracking link is the only way back to your order — there's no account to log into later, so keep the QR code or link.",
            "A staff member has to confirm your order before it starts — it doesn't happen automatically the instant you submit it.",
          ]}
        />

        <RoleSection
          id="customer"
          icon={UserRound}
          title="Customer & Student Accounts"
          summary="If your cafeteria is run by your university or workplace, you'll have your own account with a wallet you top up yourself."
          flowTitle="How to sign up, order, and pay"
          steps={[
            "Go to your organisation's login page and click Register (or follow the link your cafeteria shared).",
            'Choose whether you\'re a Student or a general Customer, then fill in your name, email, and a password.',
            'Check your email for a 6-digit verification code and enter it to confirm your account.',
            'Log in with your email and password.',
            'Browse the menu, add items to your cart, and go to checkout.',
            'Pick a pickup time slot and, if you like, a table — then choose "Wallet payment" to pay from your balance.',
            'Track your order live, and tap "Mark Meal Done" once you\'ve finished eating.',
          ]}
          checklist={[
            'Top up your wallet any time in fixed amounts or a custom value, up to ৳10,000 per top-up',
            'Earn reward points automatically on every order (about 1 point per ৳10 spent) and redeem 100+ points for a discount',
            'Reserve a table ahead of time',
            "Cancel an order for a full refund, as long as it hasn't been confirmed yet",
            'Download a PDF receipt and QR code for any order',
            'Update your profile, change your password, or reset a forgotten one by email',
          ]}
          gotchas={[
            "There's no live card payment yet — your wallet balance is the real way to pay; a \"Simulation payment\" option exists only for testing.",
            "Nobody needs to be asked to clean your table — tapping \"Mark Meal Done\" after eating sends a cleaner automatically.",
          ]}
        />

        <RoleSection
          id="register-org"
          icon={Building2}
          title="Putting Your Business on SCMS"
          summary="Any restaurant, cafeteria, franchise, or food court can sign up itself in a few minutes — no approval from SCMS's own team is required."
          flowTitle="How to register"
          steps={[
            'From the homepage, click "Register your organisation."',
            'Step 1 — Category: choose the type that fits — Independent Restaurant, Corporate Cafeteria, Academic Cafeteria, Franchise Brand, or Food Court.',
            'Step 2 — Organisation details: enter your business name (a web address is suggested automatically), city, contact email, and brand colour. Academic/Corporate businesses can optionally restrict sign-ups to one email domain.',
            'Step 3 — Admin account: enter your own name, email, and a password.',
            "Submit. You're logged straight into your new dashboard — no separate login step, no waiting for approval.",
          ]}
          checklist={[
            'New organisations start on the Free plan and can be upgraded any time',
            'A single restaurant, franchise brand, or food court is created this way',
          ]}
          gotchas={[
            'Choosing Restaurant means your diners will always order as walk-in guests — customer accounts and wallets are only available to Cafeteria-type organisations, by design.',
            "A single franchise branch or food-court stall can't be created from this form — sign up the parent Franchise Brand or Food Court first, then add branches/stalls from inside its own dashboard.",
          ]}
        />

        <RoleSection
          id="tenant-admin"
          icon={UtensilsCrossed}
          title="Running Your Cafeteria or Restaurant"
          summary="As the owner or admin of a single venue, you manage everything from one dashboard: menu, tables, staff, inventory, and reports."
          flowTitle="How to add a menu item"
          steps={[
            'Open Menu Management from your dashboard.',
            'Pick a category on the left (or add a new one).',
            'Click "+ Add Item," and fill in the name, price, description, prep time, and a photo.',
            'Tick "Available" so it shows up for diners, and "Homemade" if it applies.',
            'Click "Create Item" — it appears on your live menu immediately, no separate publish step.',
          ]}
          checklist={[
            'Build your table layout with the drag-and-drop floor plan editor — tables change colour live as they become occupied, reserved, or cleaned',
            'Track ingredients and stock, with purchase orders and automatic low-stock alerts',
            'Invite staff, servers, cleaners, and outlet admins by email — they set their own password when they accept',
            'View a daily/weekly/monthly dashboard, revenue trends, busiest hours, and top-selling items',
            'Generate official PDF memos and download order receipts',
            'Turn on the public guest-ordering link so walk-in customers can scan a QR and order (restaurant-type venues)',
            'Set up a self-service kiosk terminal and rotating digital signage screens',
          ]}
          gotchas={[
            'Table QR codes come from the Public Link page, not the Tables page — set up your tables first, then go to Public Link to turn on guest ordering and download the printable QR sheet.',
            "Guest \"online payment\" is a demo simulation for now, not a real payment gateway.",
            "When a diner taps \"I'm done eating,\" a cleaner is assigned automatically — there's no button anywhere to assign one by hand.",
            "Staff invite links are shown to you only once, right after sending — copy it immediately as a backup in case the invite email doesn't arrive; it can't be retrieved again later.",
          ]}
        />

        <RoleSection
          id="super-admin"
          icon={Store}
          title="Running a Franchise Brand"
          summary="If you registered as a Franchise Brand, you get everything a single-venue admin has, plus tools to open and compare branches."
          flowTitle="How to open a new branch"
          steps={[
            'Open the Outlets page from your dashboard.',
            'Click "+ Add Outlet" and fill in the name, web address, and city.',
            'Click "Create Outlet" — the new branch is live instantly, with its own menu, tables, and staff, no approval needed.',
          ]}
          checklist={[
            'Compare orders, revenue, and unique customers across every outlet in one report',
            'Manage a central warehouse of ingredients and transfer stock out to any specific outlet',
          ]}
          gotchas={[
            "New outlets can be created instantly, but only up to your subscription plan's outlet limit — you'll be prompted to upgrade if you hit it.",
          ]}
        />

        <RoleSection
          id="food-court-admin"
          icon={ChefHat}
          title="Running a Food Court"
          summary="A food court doesn't sell food directly — it manages the shared dining floor that several independent stalls (vendors) serve from."
          flowTitle="How to see and deliver orders across every stall"
          steps={[
            'Open your Food Court Dashboard to see every vendor\'s active order count and how full your floor is.',
            'Open the Delivery Queue to see every order that\'s ready for pickup, from any stall.',
            'Click deliver on a ready order once it\'s been physically handed to the diner.',
          ]}
          checklist={[
            'See a combined menu across every stall in one place',
            'Manage the shared tables and the shared serving/cleaning staff — these belong to the food court itself, not any one stall',
            'View a settlement report showing revenue and order counts owed to each vendor stall',
          ]}
          gotchas={[
            "Each vendor stall manages its own menu and inventory — you can see everyone's orders together, but never edit one stall's menu or see into their inventory directly.",
            "Only your food court's shared Server role can mark an order \"delivered\" — an individual vendor's own staff can't do this themselves, since one person physically hands the food over at the shared counter.",
          ]}
        />

        <RoleSection
          id="staff"
          icon={ShieldCheck}
          title="Staff & Servers"
          summary="As kitchen or floor staff, you confirm and prepare orders as they come in, and can key in walk-in orders directly."
          flowTitle="How to work an order"
          steps={[
            "Log in — you'll land on the live kitchen order queue automatically.",
            'As new orders arrive, click "Confirm Order," then "Start Preparing," then "Mark Ready," then "Mark Delivered" as each one progresses.',
            'For a walk-in customer without a QR code, open POS, add their items, optionally note a table or name, and click "Place order" — it\'s confirmed immediately.',
          ]}
          checklist={[
            "Toggle any menu item on/off instantly if it sells out",
            'Turn the new-order sound alert on or off',
            'At a food court, use the Delivery Queue to hand off any ready order from any stall',
          ]}
          gotchas={[
            'The order queue updates by itself — you never need to refresh the page to see a new order arrive.',
          ]}
        />

        <RoleSection
          id="cleaner"
          icon={Sparkles}
          title="Cleaning Staff"
          summary="You only ever see your own assignments — never anyone else's — and they appear automatically."
          flowTitle="How to clear a table"
          steps={[
            'Log in — your active cleaning assignments appear automatically, with the table number, zone, and when you were assigned.',
            'Tap "Start Cleaning" when you begin.',
            'Tap "Mark Done" and confirm — the table becomes available again instantly for everyone.',
          ]}
          checklist={['See a log of everything you\'ve completed today']}
          gotchas={[
            "You're assigned automatically the moment a diner says they're finished — nobody has to ask you or assign you by hand.",
          ]}
        />
      </div>

      {/* Org types */}
      <section id="org-types" className="scroll-mt-24 border-t border-border py-12">
        <h2 className="text-2xl font-bold tracking-tight">How Organisations Differ</h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          Every organisation on SCMS falls into one of two groups, decided automatically by the
          type chosen when it registered — this is why some features exist for some readers above
          and not others.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl border-black/5 p-5">
            <h3 className="text-lg font-bold tracking-tight">Cafeteria segment</h3>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Academic &amp; Corporate</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A closed community. Diners log in with a real account and pay from a pre-loaded
              wallet. No walk-in/guest ordering.
            </p>
          </Card>
          <Card className="rounded-2xl border-black/5 p-5">
            <h3 className="text-lg font-bold tracking-tight">Restaurant segment</h3>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Independent Restaurant, Franchise Brand/Outlet, Food Court/Vendor
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A walk-in model. Diners scan a table QR and order as a guest with just a name and
              phone number — no account, ever.
            </p>
          </Card>
        </div>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation type</TableHead>
                <TableHead>Plain description</TableHead>
                <TableHead>Belongs under a parent?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Academic Cafeteria</TableCell>
                <TableCell>A university/college cafeteria. Accounts, often campus-email-restricted, pay from a wallet.</TableCell>
                <TableCell>Standalone</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Corporate Cafeteria</TableCell>
                <TableCell>An in-office cafeteria for one company. Same account/wallet model.</TableCell>
                <TableCell>Standalone</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Independent Restaurant</TableCell>
                <TableCell>A single standalone restaurant. Walk-in guests order via QR.</TableCell>
                <TableCell>Standalone</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Franchise Brand</TableCell>
                <TableCell>The head office of a chain. Doesn't serve food itself — owns branches.</TableCell>
                <TableCell>Parent</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Franchise Outlet</TableCell>
                <TableCell>One physical branch — its own menu, tables, staff, QR codes.</TableCell>
                <TableCell>Child of a Franchise Brand</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Food Court</TableCell>
                <TableCell>A shared dining floor with multiple stalls. Manages tables &amp; delivery staff, no menu of its own.</TableCell>
                <TableCell>Parent</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Food Court Vendor</TableCell>
                <TableCell>One stall inside a food court — its own menu, own inventory, shares the floor.</TableCell>
                <TableCell>Child of a Food Court</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-t border-border py-12">
        <h2 className="text-2xl font-bold tracking-tight">Frequently Asked Questions</h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          Click any question for the answer.
        </p>
        <Accordion type="single" collapsible className="mt-6 max-w-3xl">
          {FAQS.map(({ q, a }, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger>{q}</AccordionTrigger>
              <AccordionContent>{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <div className="mt-12 border-t border-border pt-8 text-center">
        <Button asChild size="lg" className="rounded-2xl">
          <Link href="/">← Back to home</Link>
        </Button>
      </div>
    </main>
  )
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do I need to create an account to order?',
    a: "No, if you're at a restaurant, franchise outlet, or food court — just scan the table QR and order as a guest. Cafeterias (academic/corporate) do require an account, since they're closed communities that use a shared wallet system.",
  },
  {
    q: 'Is online payment real, or a demo?',
    a: 'Right now, all online payment (wallet payments, guest "pay online," and "simulation payment") is a working demo, not a live bank/card/mobile-money connection. Nothing charges a real card yet.',
  },
  {
    q: 'How do I add money to my wallet?',
    a: 'Go to Wallet from the menu, pick a quick amount (৳100/200/500/1000) or enter a custom amount up to ৳10,000, and click "Add Funds." It\'s credited instantly.',
  },
  {
    q: 'How do I get a QR code for my tables?',
    a: 'Go to Public Link in your admin dashboard (not the Tables page), turn on public ordering, and click "Download table QR sheet (PDF)" — make sure your tables are set up first.',
  },
  {
    q: 'Does someone need to ask for my table to be cleaned?',
    a: 'No. As soon as a diner taps "I\'m done eating" (or an admin marks a table for cleaning), the system automatically assigns the next available cleaner — no manual step for anyone.',
  },
  {
    q: "What's the difference between a Cafeteria and a Restaurant account?",
    a: 'Cafeterias (academic and corporate) are closed communities — diners log in and pay from a wallet. Restaurants (independent, franchise, food court) use walk-in guest ordering — diners scan a QR and never need an account.',
  },
  {
    q: 'Can my restaurant offer customer logins?',
    a: 'Not currently — by design, restaurant-type venues always use the walk-in guest model, and cafeteria-type venues always use accounts and wallets. This is fixed by the category chosen at signup.',
  },
  {
    q: 'How do reward points work?',
    a: 'You earn about 1 point for every ৳10 you spend on a paid order. Once you have 100 or more, you can redeem them for a discount (up to 20% off) at checkout.',
  },
  {
    q: 'I run a franchise — how do I open a new branch?',
    a: 'Go to Outlets in your dashboard, click "+ Add Outlet," fill in the details, and it\'s created instantly — no approval needed from SCMS.',
  },
  {
    q: 'What happens if I cancel an order?',
    a: 'You can cancel while it\'s still "pending" (not yet confirmed by staff) for a full wallet refund. Any reward points earned on that order are reversed too.',
  },
  {
    q: 'How do I add a new staff member?',
    a: 'Go to Invite Staff in your dashboard, enter their email, and pick a role (Staff, Cleaner, Server, or Outlet Admin). They\'ll get an email link to set their own password.',
  },
  {
    q: 'I sent a staff invite but lost the link — can I get it again?',
    a: "No — the invite link is only ever shown once, right when you send it. If it's lost, revoke that invitation and send a new one.",
  },
  {
    q: "Can a food-court vendor mark their own orders as delivered?",
    a: "No — only the food court's own shared Server role can, since one person physically hands the food over at the shared pickup counter.",
  },
  {
    q: 'What is "Homemade" on a menu item?',
    a: 'A tag academic cafeterias can turn on to let students sell their own homemade food alongside the regular menu.',
  },
  {
    q: "Why can't I create a new franchise outlet or food-court stall directly on the signup page?",
    a: 'Because they need a parent organisation to belong to. Sign up the Franchise Brand or Food Court itself first, then add outlets/stalls from inside its own dashboard.',
  },
  {
    q: 'How long does a login verification code last?',
    a: 'Ten minutes, and you get 5 tries before you need to request a new one.',
  },
  {
    q: 'Do I have to be logged in to track a guest order?',
    a: "No — the tracking link/QR you're given at checkout works for anyone, no login required. Just don't lose it.",
  },
  {
    q: 'What roles get the extra 6-digit login code?',
    a: 'Only admin-level roles (tenant admin, super admin, food court admin). Customers, students, staff, servers, and cleaners just log in with email and password.',
  },
]
