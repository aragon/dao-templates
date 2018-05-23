Demo Survey Kit
===============

Usage
-----

This kit requires you to already have the [Survey Kit](../survey) deployed onto a local chain. The
simpliest way to do so is to clone [aragen](https://github.com/aragon/aragen), and use its
`npm run start:survey` command.

Once you've deployed the base Survey Kit, you can simply run this kit's migration (adding `ENS` to
the environment if you're deploying a custom ENS to a chain outside of aragen): `npm run migrate`.

That's it!
