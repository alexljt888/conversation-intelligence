import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import httpx
from main import app, AnalyzeResponse, FollowUpItem

async def check():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
        for transcript in ['', '   ', 'x' * 20001]:
            response = await client.post('/api/analyze', json={'transcript': transcript})
            assert response.status_code == 422
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            response = await client.post('/api/analyze', json={'transcript': 'Alex: Hello.'})
            assert response.status_code == 503
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
            with patch('main.AsyncOpenAI') as mocked_client:
                parse = mocked_client.return_value.__aenter__.return_value.responses.parse
                valid_item = FollowUpItem(
                    task='Send proposal', owner='Alex', deadline=None,
                    evidence='Alex: I will send the proposal.',
                    commitment_type='explicit', needs_review=False,
                )
                for items in [[], [valid_item]]:
                    parse.return_value = SimpleNamespace(status='completed', output_parsed=AnalyzeResponse(items=items))
                    response = await client.post('/api/analyze', json={'transcript': 'Alex: I will send the proposal.'})
                    assert response.status_code == 200
                    assert response.json() == {'items': [item.model_dump() for item in items]}
                for evidence in ['', '   ', 'Alex promised to send the proposal.', 'Alex: I will send...']:
                    invalid_item = valid_item.model_copy(update={'evidence': evidence})
                    parse.return_value = SimpleNamespace(status='completed', output_parsed=AnalyzeResponse(items=[invalid_item]))
                    response = await client.post('/api/analyze', json={'transcript': 'Alex: I will send the proposal.'})
                    assert response.status_code == 502
                suggestion = FollowUpItem(
                    task='Follow up with the customer', owner=None, deadline='next week',
                    evidence='Alex: Someone should follow up with the customer next week.',
                    commitment_type='suggestion', needs_review=True,
                )
                parse.return_value = SimpleNamespace(status='completed', output_parsed=AnalyzeResponse(items=[suggestion]))
                response = await client.post('/api/analyze', json={'transcript': suggestion.evidence})
                assert response.status_code == 200
                assert response.json()['items'][0] == suggestion.model_dump()
                # Reproduce a model ignoring the ownership instruction.
                for owner in [None, '', '   ']:
                    ambiguous_item = suggestion.model_copy(update={'owner': owner, 'needs_review': False})
                    parse.return_value = SimpleNamespace(status='completed', output_parsed=AnalyzeResponse(items=[ambiguous_item]))
                    response = await client.post('/api/analyze', json={'transcript': suggestion.evidence})
                    assert response.status_code == 200
                    assert response.json()['items'][0]['needs_review'] is True
                # A known owner and missing deadline do not force review, and
                # other model-identified reasons for review remain intact.
                for review_flag in [False, True]:
                    known_owner_item = valid_item.model_copy(update={'needs_review': review_flag})
                    parse.return_value = SimpleNamespace(status='completed', output_parsed=AnalyzeResponse(items=[known_owner_item]))
                    response = await client.post('/api/analyze', json={'transcript': valid_item.evidence})
                    assert response.status_code == 200
                    assert response.json()['items'][0]['needs_review'] is review_flag
                parse.return_value = SimpleNamespace(status='incomplete', output_parsed=None)
                response = await client.post('/api/analyze', json={'transcript': 'Alex: Send it.'})
                assert response.status_code == 502
    print('Backend checks passed: validation, missing key, mocked items/empty results, evidence matching/rejection, suggestion metadata, unknown-owner review enforcement, missing-deadline behavior, existing review flags, incomplete output.')
    print('No live OpenAI call was made.')

asyncio.run(check())
