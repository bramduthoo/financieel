# 2  Foundations

This chapter explains how a website works and which building blocks are needed to make one. Every section first explains a concept from the ground up, then shows why this project uses it and how it appears in our code. By the end of the chapter you should be able to look at any file in the project and know what role it plays in the whole.

## 2.1  How a website works

### 2.1.1  Two computers talking

Every website involves two computers. Your own computer runs a **browser** (Chrome, Firefox, Safari). Somewhere else in the world a **server** runs day and night, holding the website's files and data. A server is not a special kind of machine; it is an ordinary computer whose job is to wait for requests and answer them.

When you type an address like `financieel-sepia.vercel.app` and press enter, the following happens:

1. The browser sends a **request** across the internet: "please give me this page."
2. The server answers with a **response**: a set of files.
3. The browser reads those files and draws the page on your screen.

This request and response cycle is the heartbeat of the web. It does not happen once per website but constantly: every image, every piece of data, every saved change is its own little request and response. The agreed format these messages follow is called **HTTP**, which is why addresses begin with `https://` (the *s* means the connection is encrypted).

### 2.1.2  Frontend and backend

The files the server sends are not the whole story. A useful application also needs to *remember* things. In our case: wallets, transactions, income, budgets. This splits every web application into two halves:

- The **frontend** is everything that runs in the browser: the screens, the buttons, the charts, the logic that reacts when you click. The frontend is sent to your browser and executes there, on your machine.
- The **backend** is everything that stays on the server side: most importantly the **database**, the permanent storage where all data lives, plus the rules about who may read or change that data.

The frontend is temporary by nature. Close the browser tab and it is gone. The next time you open the site, a fresh copy is sent over. The backend is permanent: the database keeps its contents whether or not anyone is looking at the site. The frontend therefore continuously asks the backend for data ("give me all wallets") and sends changes back ("save this new transaction").

### 2.1.3  The three roles, and what fills them in our project

Putting it together, every web application needs three things, and our project fills each role with a specific service:

| Role | What it does | In our project |
|---|---|---|
| Frontend | The application itself, running in the browser | Built with React, written by us |
| Backend | Stores data permanently, checks who is allowed to do what | Supabase, a hosted database service |
| Hosting | A server that hands the frontend files to any visitor | Vercel |

Two of the three are services we rent rather than build. Supabase gives us a professional database without managing a server ourselves. Vercel publishes our frontend to the world and keeps it online. The part we actually write, the tens of files in this repository, is almost entirely frontend.

One more tool sits outside this trio: **GitHub**, which stores the history of our code and connects our laptops to Vercel. Section 2.8 covers it. With the map in place, the next sections zoom into each part, starting with the languages the browser itself understands.

## 2.2  The three languages of the browser

A browser can interpret exactly three languages, and each has one fixed role. There is no choice involved: whoever builds for the web uses these three.

| Language | Role | Question it answers |
|---|---|---|
| HTML | Structure | What is on the page? |
| CSS | Appearance | What does it look like? |
| JavaScript | Behaviour | What happens when the user does something? |

### 2.2.1  HTML: the structure

HTML describes a page as a tree of **elements**. An element is written with tags: an opening tag, content, and a closing tag.

```html
<button>Add transaction</button>
```

Elements nest inside each other, which is what creates the tree. A page is one big element (`<html>`) containing a header section (`<head>`, invisible metadata) and a body (`<body>`, the visible content), which in turn contains sections, headings, paragraphs, buttons, input fields and so on. Elements can carry **attributes**, named settings inside the opening tag:

```html
<div id="root"></div>
```

Here a `div` (a neutral container element) carries the attribute `id` with value `root`, giving this element a name other code can find it by.

Our project contains exactly one HTML file, `index.html`, and its body is nearly empty: it holds the single `<div id="root">` above and one line that loads our JavaScript. That is no accident. In our project, HTML provides only the empty stage; everything the user actually sees is created by JavaScript while the app runs. Why we build it this way becomes clear in the React section (2.4).

### 2.2.2  CSS: the appearance

Left alone, HTML renders as black text on a white background. CSS (Cascading Style Sheets) assigns visual properties to elements: colours, sizes, spacing, fonts, position. A CSS rule selects elements and sets properties on them:

```css
button {
  background-color: #111827;
  color: white;
  border-radius: 8px;
  padding: 8px 16px;
}
```

This rule says: every `button` element gets a dark background, white text, rounded corners, and some inner spacing.

Two CSS ideas are worth knowing because the entire layout of our app rests on them.

**The box model.** Every element is a rectangular box with four layers, from inside out: the content itself, **padding** (space between content and border), the **border**, and **margin** (space pushing other elements away). Nearly all visual spacing in any web page is tuning of these layers.

**Flexbox.** Flexbox is the CSS system for arranging elements next to or below each other in a controlled way: in a row or a column, centred or spread out, fixed width or stretching to fill space. Our app's outer frame, the sidebar next to the page content, is one flexbox row. The rows inside every table and list are flexboxes too. When you later see classes like `flex`, `items-center` or `justify-between` in our code, they are instructions to this system.

Our project barely contains any handwritten CSS: the file `src/index.css` is one line long. Instead of writing rules like the example above, we use Tailwind, a system that provides thousands of tiny ready-made classes. How that works, and why we chose it, is section 2.5. Tailwind is still CSS underneath; understanding the box model and flexbox is understanding Tailwind.

### 2.2.3  JavaScript: the behaviour

HTML and CSS are *descriptions*; neither can compute anything or react to the user. JavaScript is the programming language of the browser: a full language with variables, functions, conditions and loops, in spirit much like the languages you already know from data analysis.

JavaScript can do two special things no other code in the browser can:

1. **React to events.** Clicks, typing, key presses. You attach a function to an event and the browser calls it at the right moment.
2. **Modify the page while it is on screen.** When the browser reads HTML it builds an internal tree of objects representing every element, called the **DOM** (Document Object Model). JavaScript can change that tree at any time: add elements, remove them, change their text. The browser instantly redraws to match. The page can therefore change continuously without ever reloading.

These two abilities together make applications possible. When you click "Add transaction" in our app, a JavaScript function runs; it sends the new transaction to the database, then modifies the DOM so the new row appears in your list. No page reload, no new request for HTML; the page simply transforms under your cursor.

In our project, JavaScript is not just a layer on top; it *is* the application. Every file in the `src/` folder is JavaScript (or JSX, a JavaScript extension introduced in section 2.4). The next section covers the parts of the language itself that you need in order to read those files.
