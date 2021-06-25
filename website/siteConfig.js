/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* List of projects/orgs using your project for the users page */
const users = [
  {
    caption: 'Callstack',
    image: '/haul/img/callstack.png',
    infoLink: 'https://blog.callstack.io',
    pinned: true,
  },
  {
    caption: 'Rally Health',
    image: '/haul/img/rally-logo.svg',
    infoLink: 'http://engineering.rallyhealth.com/',
    pinned: false,
  },
  {
    caption: 'Atakama, LLC',
    image: 'https://www.atakama.com/#',
    infoLink: 'http://atakama.com/faq',
    pinned: false,
  },
];

const siteConfig = {
  title: 'Haul',
  tagline: 'A command line tool for developing React Native apps',
  url: 'https://facebook.github.io' /* your website url */,
  baseUrl: '/haul/' /* base url for your project */,
  projectName: 'haul',
  headerLinks: [
    { doc: 'getting_started', label: 'Docs' },
    { doc: 'cli', label: 'CLI' },
    { href: 'https://github.com/callstack/haul', label: 'GitHub' },
  ],
  users,
  /* path to images for header/footer */
  headerIcon: 'img/haul_logo_box_only.png',
  favicon: 'img/favicon.ico',
  /* colors for website */
  colors: {
    // TODO: colors
    primaryColor: '#CC8445',
    secondaryColor: '#F7BA74',
  },
  // This copyright info is used in /core/Footer.js and blog rss/atom feeds.
  copyright: `Copyright © ${new Date().getFullYear()} Callstack.io`,
  // organizationName: 'deltice', // or set an env variable ORGANIZATION_NAME
  highlight: {
    // Highlight.js theme to use for syntax highlighting in code blocks
    theme: 'default',
  },
  // You may provide arbitrary config keys to be used as needed by your template.
  repoUrl: 'https://github.com/callstack/haul',
};

module.exports = siteConfig;
