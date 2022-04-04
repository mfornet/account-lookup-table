// import './App.css';
import { useEffect, useState } from 'react';
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

function formatValue(amount, nearPrice, currency) {
  if (currency === 'NEAR') {
    return formatNEAR(amount) + 'Ⓝ'
  } else {
    return '$' + (parseFloat(formatNEAR(amount).replace(',', '')) * nearPrice).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  }
}

async function fetchNearPrice() {
  const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=NEARUSDT')
  const content = await res.json()
  return content.price
}

async function populateFields(lockup) {
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

// TODO: Aggregate all info in an extra row (sum of total/locked/liquid/staked)
function App() {
  const [table, setTable] = useState(getValues());
  const [nearPrice, setNearPrice] = useState(0.0);
  const [currency, setCurrency] = useState('NEAR');

  const update = async () => {
    const n_table = [...table];
    setValues(n_table);
    setTable(n_table);
  }

  const updateLockup = async (lockupAccountId = null) => {
    await Promise.all(table.filter((value) => lockupAccountId === null || value.lockup === lockupAccountId).map(async (value) => {
      await populateFields(value);
      await update();
    }))
  }

  const updateAll = async (updatePrice = true) => {
    if (updatePrice) {
      setNearPrice(await fetchNearPrice());
    }
    await Promise.all(table.map(async (value) => {
      await populateFields(value);
      await update();
    }))
  }

  useEffect(() => {
    const inner = async () => {
      setNearPrice(await fetchNearPrice()); await updateAll(false);
    }
    inner()
  }, [nearPrice])

  const setMessage = (msg) => {
    // TODO: Display message somewhere
    console.log(msg);
  }

  const innerTryCreateEntry = async (lockupAccountId) => {
    const near = await nearAPI.connect(options)
    const account = await near.account(lockupAccountId)
    try {
      await account.state()
    } catch (e) {
      setMessage('Account doesn`t exist')
      return null;
    }

    table.push({ lockup: lockupAccountId });
    await update();
    await updateLockup(lockupAccountId);
  }

  const tryCreateEntry = (lockupAccountId) => {
    if (table.filter((value) => value.lockup === lockupAccountId).length > 0) {
      setMessage(`Account ${lockupAccountId} already exists. Ignore.`)
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

  const currencySelectorMenu = currency !== 'NEAR' ? <div><button onClick={() => setCurrency('NEAR')}>NEAR</button> | USDT</div> : <div>NEAR | <button onClick={() => setCurrency('USDT')}>USDT</button></div>

  return <div>
    <form>
      <label>
        Account:
        <input type="text" name="name" id='new_account' />
      </label>
      <input type="submit" value="Add" className='button' onClick={createEntry} />
    </form>
    <div>
      <button className='button' onClick={updateAll}>Reload all</button>
      <label>Near Price: {nearPrice}</label>
      <p>Display balance as:</p> {currencySelectorMenu}
    </div>
    <table className='table table-striped table-sm'>
      <thead>
        <tr>
          <th>Id</th>
          <th>Lockup</th>
          <th>Copy</th>
          <th>Owner</th>
          <th>Copy</th>
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
              <td>{simplifyString(val.lockup)}</td>
              <td><button onClick={() => navigator.clipboard.writeText(val.lockup)}>⎘</button></td>
              <td>{simplifyString(val.owner)}</td>
              <td><button onClick={() => navigator.clipboard.writeText(val.owner)}>⎘</button></td>
              <td>{formatValue(val.total, nearPrice, currency)}</td>
              <td>{formatValue(val.locked, nearPrice, currency)}</td>
              <td>{formatValue(val.liquid, nearPrice, currency)}</td>
              <td>{formatValue(val.staked, nearPrice, currency)}</td>
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
