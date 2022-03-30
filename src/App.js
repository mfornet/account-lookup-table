// import './App.css';
import { useState } from 'react';
import * as nearAPI from 'near-api-js'

const INFO = '__INFO'

function getValues() {
  const result = localStorage.getItem(INFO)

  if (result === null) {
    return []
  } else {
    return JSON.parse(result)
  }
}

function setValues(data) {
  localStorage.setItem(INFO, JSON.stringify(data))
}

// TODO: Remove Lockup class
// Total Balance
//     - Lockup
//         - On Contract
//             - Liquid min(OnContract, Unlocked)
//         - On Staking Pool
//             - Staked
//             - Ready to withdraw
//             - Time to withdraw
//         - Unlocked
//         - Locked
//     - Owner
class Lockup {
  constructor(params) {
    this.lockup = params.lockup;
    this.owner = params.owner;
    this.total = params.total;
    this.lockupBalance = params.lockupBalance;
    this.lockupBalanceOnContract = params.lockupBalanceOnContract;
    this.liquid = params.liquid;
    this.staked = params.staked;
    this.lockupBalanceOnStakingPool = params.lockupBalanceOnStakingPool;
    this.lockupBalanceOnStakingPoolStaked = params.lockupBalanceOnStakingPoolStaked;
    this.lockupBalanceOnStakingPoolReady = params.lockupBalanceOnStakingPoolReady;
    this.lockupBalanceOnStakingPoolTimeToWithdraw = params.lockupBalanceOnStakingPoolTimeToWithdraw;
    this.unlocked = params.unlocked;
    this.locked = params.locked;
    this.ownerBalance = params.ownerBalance;
    this.pool = params.pool;


    this.lastTimeUpdate = new Date(params.lastTimeUpdate);
    if (this.lastTimeUpdate.toString() === "Invalid Date") {
      this.lastTimeUpdate = undefined
    }
  }
}

const options = {
  networkId: "mainnet",
  keyStore: new nearAPI.keyStores.BrowserLocalStorageKeyStore(),
  nodeUrl: "https://rpc.mainnet.near.org",
  walletUrl: "https://wallet.mainnet.near.org",
  helperUrl: "https://helper.mainnet.near.org",
  explorerUrl: "https://explorer.mainnet.near.org",
}

function simplifyString(str) {
  if (typeof str !== 'string') { return str }
  const prefix = 6;
  const suffix = 16;
  if (str.length > prefix + suffix) {
    return str.substring(0, prefix) + '...' + str.substring(str.length - suffix, str.length);
  } else {
    return str;
  }
}

function formatNEAR(amount) {
  if (amount === undefined || amount === null) { return amount }
  var result = nearAPI.utils.format.formatNearAmount(amount);
  var tokens = result.split('.')

  if (tokens.length === 1) { return tokens[0] }
  return tokens[0] + '.' + tokens[1].substring(0, 2);
}

async function populateFields(lockup) {
  console.log('populate fields')
  const near = await nearAPI.connect(options)
  const account = await near.account(lockup.lockup)
  const lockupContract = new nearAPI.Contract(account, lockup.lockup, {
    viewMethods: ['get_owner_account_id', 'get_staking_pool_account_id', 'get_locked_amount', 'get_balance', 'get_liquid_owners_balance'],
    changeMethods: [],
    sender: account
  })
  // Check if the contract is a valid lockup contract by checking the owner method
  try {
    const owner = await lockupContract.get_owner_account_id();
    lockup.owner = owner;
  } catch (e) {
    const err_str = e.toString()
    if (err_str.indexOf('MethodNotFound') !== -1) {
      lockup.owner = 'Account is not a valid Lockup'
    }
    else if (err_str.indexOf('CodeDoesNotExist') !== -1) {
      lockup.owner = 'Account has no code deployed'
    } else {
      throw e;
    }
    return null;
  }

  lockup.pool = await lockupContract.get_staking_pool_account_id();
  lockup.locked = await lockupContract.get_locked_amount();
  lockup.total = await lockupContract.get_balance();
  lockup.liquid = await lockupContract.get_liquid_owners_balance();

  const stakingContract = new nearAPI.Contract(account, lockup.pool, {
    viewMethods: ['get_account'],
    changeMethods: [],
    sender: account
  })

  lockup.staked = (await stakingContract.get_account({ account_id: lockup.lockup })).staked_balance;
}

// TODO: Create a reload button (for single accounts && for all accounts)
// TODO: Single account view
function App() {
  const [table, setTable] = useState(getValues());


  const update = async () => {
    const n_table = [...table];
    setValues(n_table);
    setTable(n_table);
  }


  const updateLockup = async (lockupAccountId = null, force = false) => {
    await Promise.all(table.filter((value) => lockupAccountId === null || value.lockup === lockupAccountId).map(async (value) => {
      await populateFields(value);
      await update();
    }))
  }

  const innerTryCreateEntry = async (lockupAccountId) => {
    const near = await nearAPI.connect(options)
    const account = await near.account(lockupAccountId)
    try {
      await account.state()
    } catch (e) {
      // TODO: Add better message
      console.log('Account doesn`t exist')
      return null;
    }

    table.push(new Lockup({ lockup: lockupAccountId }));
    await update();
    await updateLockup(lockupAccountId);
  }

  const tryCreateEntry = (lockupAccountId) => {
    if (table.filter((value) => value.lockup === lockupAccountId).length > 0) {
      // TODO: Put a message somewhere about this
      console.log(`Account ${lockupAccountId} already exists. Ignore.`)
      return;
    }
    innerTryCreateEntry(lockupAccountId);
  };

  const createEntry = (e) => {
    var newAccount = document.getElementById('new_account').value;
    if (newAccount.length > 0) {
      document.getElementById('new_account').value = '';
      tryCreateEntry(newAccount);
    }
    e.preventDefault();
  };

  const removeRow = (index) => {
    table.splice(index, 1);
    update();
  };

  // TODO: Add button to reload everything
  // TODO: Fetch NEAR Price from Binance
  // TODO: Allow switching balances between NEAR and equivalent in USDT
  // TODO: Add indicator that some value is being updated
  return <div>
    <form>
      <label>
        Account:
        <input type="text" name="name" id='new_account' />
      </label>
      <input type="submit" value="Add" className='button' onClick={createEntry} />
    </form>

    <table className='table table-striped table-sm'>
      <thead>
        <tr>
          <th>Id</th>
          <th>Lockup</th>
          <th>Owner</th>
          <th>Total</th>
          <th>Locked</th>
          <th>Liquid</th>
          <th>Staked</th>
          <th>Staking Pool</th>
          <th>Reload</th>
          <th>Remove</th>
        </tr>
      </thead>
      <tbody>
        {table.map((val, key) => {
          return (
            <tr key={key}>
              <td>{key}</td>
              {/* TODO: Make a view page to see more details of each contract */}
              {/* TODO: Download all transactions that have been executed so far */}
              {/* TODO: Show reward in the last 2 days (or something like this) */}
              <td>{simplifyString(val.lockup)}</td>{/* TODO: Copy to clipboard full account (or maybe go to explorer) */}
              <td>{simplifyString(val.owner)}</td>{/* TODO: Copy to clipboard full account (or maybe go to explorer) */}
              <td>{formatNEAR(val.total)}</td>
              <td>{formatNEAR(val.locked)}</td>
              <td>{formatNEAR(val.liquid)}</td>
              <td>{formatNEAR(val.staked)}</td>
              <td>{val.pool}</td>
              <td><button className='button' onClick={() => updateLockup(val.lockup)}>R</button></td>
              <td><button className='button' onClick={() => removeRow(key)}>X</button></td>
            </tr>)
        })}
      </tbody>
    </table>
  </div >
}

export default App;
